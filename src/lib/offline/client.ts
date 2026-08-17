import type { Movie } from "@/lib/media/types";

const DB_NAME = "constants-hub-offline";
const DB_VERSION = 1;
const CHUNK_SIZE = 2 * 1024 * 1024;

export type OfflineStatus = "downloading" | "paused" | "ready" | "failed";
export type OfflineDownload = Pick<Movie, "id" | "title" | "year" | "fileName" | "mediaType" | "seriesTitle" | "seasonNumber" | "episodeNumber"> & {
  size: number;
  downloadedBytes: number;
  chunkCount: number;
  mime: string;
  etag: string | null;
  status: OfflineStatus;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  poster?: Blob | null;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline storage request failed."));
  });
}

export function openOfflineDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("downloads")) database.createObjectStore("downloads", { keyPath: "id" });
      if (!database.objectStoreNames.contains("chunks")) {
        const store = database.createObjectStore("chunks", { keyPath: "key" });
        store.createIndex("byMedia", "mediaId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open offline storage."));
  });
}

async function putDownload(download: OfflineDownload) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction("downloads", "readwrite");
  transaction.objectStore("downloads").put(download);
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  database.close();
}

async function putChunk(mediaId: string, index: number, bytes: ArrayBuffer) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction("chunks", "readwrite");
  transaction.objectStore("chunks").put({ key: `${mediaId}:${index}`, mediaId, index, bytes });
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  database.close();
}

export async function getOfflineDownload(id: string) {
  const database = await openOfflineDatabase();
  const result = await requestResult(database.transaction("downloads").objectStore("downloads").get(id)) as OfflineDownload | undefined;
  database.close();
  return result || null;
}

export async function listOfflineDownloads() {
  const database = await openOfflineDatabase();
  const result = await requestResult(database.transaction("downloads").objectStore("downloads").getAll()) as OfflineDownload[];
  database.close();
  return result.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export async function removeOfflineDownload(id: string) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(["downloads", "chunks"], "readwrite");
  transaction.objectStore("downloads").delete(id);
  const index = transaction.objectStore("chunks").index("byMedia");
  const cursor = index.openCursor(IDBKeyRange.only(id));
  cursor.onsuccess = () => { const current = cursor.result; if (current) { current.delete(); current.continue(); } };
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  database.close();
}

async function artwork(movie: Movie) {
  if (!movie.posterUrl) return null;
  try { const response = await fetch(movie.posterUrl); return response.ok ? await response.blob() : null; } catch { return null; }
}

export async function downloadForOffline(movie: Movie, onProgress: (download: OfflineDownload) => void, signal?: AbortSignal) {
  if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
  let existing = await getOfflineDownload(movie.id);
  if (existing?.status === "ready") return existing;
  let offset = existing?.downloadedBytes || 0;
  let chunkIndex = existing?.chunkCount || 0;
  const headers: HeadersInit = offset ? { Range: `bytes=${offset}-`, ...(existing?.etag ? { "If-Range": existing.etag } : {}) } : {};
  const response = await fetch(`/api/media/offline/${movie.id}`, { headers, signal });
  if (response.status === 409) {
    const preparation = await fetch(`/api/media/offline/${movie.id}`, { method: "POST" });
    if (!preparation.ok) throw new Error("This title needs compatibility preparation, but the conversion could not be queued.");
    throw new Error("Compatibility preparation was added to the existing conversion queue. Download it after that job finishes—no second conversion will run.");
  }
  if (!response.ok || !response.body) throw new Error(response.status === 401 ? "Sign in again before downloading." : "Could not start this offline download.");
  if (offset && response.status === 200) { await removeOfflineDownload(movie.id); existing = null; offset = 0; chunkIndex = 0; }
  const contentRange = response.headers.get("content-range");
  const total = Number(contentRange?.split("/")[1] || response.headers.get("x-offline-size") || response.headers.get("content-length") || 0);
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  const available = estimate?.quota && estimate?.usage !== undefined ? estimate.quota - estimate.usage : null;
  if (!offset && available !== null && total > available * 0.9) throw new Error("This device does not have enough available app storage for that title.");
  const now = new Date().toISOString();
  let download: OfflineDownload = existing || { id: movie.id, title: movie.title, year: movie.year, fileName: movie.fileName, mediaType: movie.mediaType, seriesTitle: movie.seriesTitle, seasonNumber: movie.seasonNumber, episodeNumber: movie.episodeNumber, size: total, downloadedBytes: 0, chunkCount: 0, mime: response.headers.get("content-type") || "video/mp4", etag: response.headers.get("etag"), status: "downloading", createdAt: now, updatedAt: now, error: null, poster: await artwork(movie) };
  download = { ...download, size: total, status: "downloading", error: null, updatedAt: now };
  await putDownload(download); onProgress(download);
  const reader = response.body.getReader();
  let pending = new Uint8Array(0);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const joined = new Uint8Array(pending.length + value.length); joined.set(pending); joined.set(value, pending.length); pending = joined;
      while (pending.length >= CHUNK_SIZE) {
        const chunk = pending.slice(0, CHUNK_SIZE); pending = pending.slice(CHUNK_SIZE);
        await putChunk(movie.id, chunkIndex, chunk.buffer); chunkIndex += 1; offset += chunk.length;
        download = { ...download, downloadedBytes: offset, chunkCount: chunkIndex, updatedAt: new Date().toISOString() };
        await putDownload(download); onProgress(download);
      }
    }
    if (pending.length) { await putChunk(movie.id, chunkIndex, pending.buffer); chunkIndex += 1; offset += pending.length; }
    download = { ...download, downloadedBytes: offset, chunkCount: chunkIndex, status: "ready", updatedAt: new Date().toISOString(), error: null };
    await putDownload(download); onProgress(download); return download;
  } catch (reason) {
    const paused = signal?.aborted;
    download = { ...download, downloadedBytes: offset, chunkCount: chunkIndex, status: paused ? "paused" : "failed", updatedAt: new Date().toISOString(), error: paused ? null : reason instanceof Error ? reason.message : "Download interrupted." };
    await putDownload(download); onProgress(download);
    if (!paused) throw reason;
    return download;
  }
}

export async function offlineStorageEstimate() {
  const estimate = await navigator.storage?.estimate?.();
  return { usage: estimate?.usage || 0, quota: estimate?.quota || 0, persistent: await navigator.storage?.persisted?.().catch(() => false) || false };
}
