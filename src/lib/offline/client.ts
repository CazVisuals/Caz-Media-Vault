import type { Movie } from "@/lib/media/types";

const DB_NAME = "constants-hub-offline";
const DB_VERSION = 1;
const CHUNK_SIZE = 512 * 1024;
const CACHE_CHUNK_SIZE = 2 * 1024 * 1024;
const OPFS_DIR = "offline-media";
const DOWNLOAD_CACHE = "constants-hub-downloads-v1";

type OfflineBackend = "opfs" | "idb" | "cache";
type StorageManagerWithOpfs = { getDirectory?: () => Promise<FileSystemDirectoryHandle> };

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
  storageBackend?: OfflineBackend;
  chunkSize?: number;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline storage request failed."));
  });
}

let databasePromise: Promise<IDBDatabase> | null = null;

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function openOfflineDatabaseOnce() {
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
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
              databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error("Could not open offline storage."));
    request.onblocked = () => reject(new Error("Offline storage is temporarily busy."));
  });
}

async function resetOfflineDatabaseConnection() {
  const current = databasePromise;
  databasePromise = null;
  if (!current) return;
  try {
    const database = await current;
    database.close();
  } catch {}
}

async function withDatabaseRetry<T>(operation: (database: IDBDatabase) => Promise<T>) {
  let lastError: unknown;
  for (const wait of [0, 120, 350]) {
    if (wait) await delay(wait);
    try {
      return await operation(await openOfflineDatabase());
    } catch (error) {
      lastError = error;
      await resetOfflineDatabaseConnection();
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Offline storage operation failed.");
}

export async function openOfflineDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = (async () => {
    let lastError: unknown;
    for (const wait of [0, 150, 400, 900]) {
      if (wait) await delay(wait);
      try {
        return await openOfflineDatabaseOnce();
      } catch (error) {
        lastError = error;
        databasePromise = null;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not open offline storage.");
  })();

  try {
    return await databasePromise;
  } catch (error) {
    databasePromise = null;
    throw error;
  }
}

function cacheMetaRequest(id: string) {
  return new Request(`/__offline/meta/${encodeURIComponent(id)}`);
}

function cacheChunkRequest(id: string, index: number) {
  return new Request(`/__offline/chunk/${encodeURIComponent(id)}/${index}`);
}

async function getDownloadCache() {
  return caches.open(DOWNLOAD_CACHE);
}

async function putCachedDownload(download: OfflineDownload) {
  const cache = await getDownloadCache();
  const { poster: _poster, ...serializable } = download;
  await cache.put(cacheMetaRequest(download.id), new Response(JSON.stringify({ ...serializable, poster: null }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  }));
}

async function getCachedDownload(id: string) {
  const cache = await getDownloadCache();
  const response = await cache.match(cacheMetaRequest(id));
  return response ? await response.json() as OfflineDownload : null;
}

async function listCachedDownloads() {
  const cache = await getDownloadCache();
  const keys = await cache.keys();
  const items: OfflineDownload[] = [];
  for (const request of keys) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/__offline/meta/")) continue;
    const response = await cache.match(request);
    if (!response) continue;
    try { items.push(await response.json() as OfflineDownload); } catch {}
  }
  return items;
}

async function putCachedChunk(mediaId: string, index: number, bytes: ArrayBuffer) {
  const cache = await getDownloadCache();
  await cache.put(cacheChunkRequest(mediaId, index), new Response(bytes, {
    headers: { "Content-Type": "application/octet-stream" },
  }));
}

async function getCachedChunk(mediaId: string, index: number) {
  const cache = await getDownloadCache();
  const response = await cache.match(cacheChunkRequest(mediaId, index));
  return response ? await response.arrayBuffer() : null;
}

async function clearCachedDownload(id: string, chunkCount = 0) {
  const cache = await getDownloadCache();
  await cache.delete(cacheMetaRequest(id));
  if (chunkCount > 0) {
    for (let index = 0; index < chunkCount; index += 1) {
      await cache.delete(cacheChunkRequest(id, index));
    }
    return;
  }
  const keys = await cache.keys();
  const prefix = `/__offline/chunk/${encodeURIComponent(id)}/`;
  await Promise.all(keys
    .filter((request) => new URL(request.url).pathname.startsWith(prefix))
    .map((request) => cache.delete(request)));
}

async function saveDownload(download: OfflineDownload) {
  if (download.storageBackend === "cache") return putCachedDownload(download);
  return putDownload(download);
}

function storageManager() {
  return navigator.storage as unknown as StorageManagerWithOpfs;
}

function opfsFileName(id: string) {
  return `${encodeURIComponent(id)}.media`;
}

async function getOpfsDirectory(create = true) {
  const manager = storageManager();
  if (!manager?.getDirectory) return null;
  const root = await manager.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create });
}

async function getOpfsFile(id: string, create = false) {
  const directory = await getOpfsDirectory(create);
  if (!directory) return null;
  try {
    const handle = await directory.getFileHandle(opfsFileName(id), { create });
    return await handle.getFile();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
}

async function removeOpfsFile(id: string) {
  try {
    const directory = await getOpfsDirectory(false);
    if (!directory) return;
    await directory.removeEntry(opfsFileName(id));
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return;
    throw error;
  }
}

async function putDownload(download: OfflineDownload) {
  await withDatabaseRetry(async (database) => {
    const transaction = database.transaction("downloads", "readwrite");
    transaction.objectStore("downloads").put(download);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not save offline download metadata."));
      transaction.onabort = () => reject(transaction.error || new Error("Offline download metadata transaction was aborted."));
    });
  });
}

async function putChunk(mediaId: string, index: number, bytes: ArrayBuffer) {
  await withDatabaseRetry(async (database) => {
    const transaction = database.transaction("chunks", "readwrite");
    transaction.objectStore("chunks").put({ key: `${mediaId}:${index}`, mediaId, index, bytes });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not save offline video data."));
      transaction.onabort = () => reject(transaction.error || new Error("Offline video storage transaction was aborted."));
    });
  });
}

async function getChunk(mediaId: string, index: number) {
  return withDatabaseRetry(async (database) => {
    const result = await requestResult(database.transaction("chunks").objectStore("chunks").get(`${mediaId}:${index}`)) as { bytes?: ArrayBuffer } | undefined;
    return result?.bytes || null;
  });
}

async function clearIdbChunks(id: string) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction("chunks", "readwrite");
  const index = transaction.objectStore("chunks").index("byMedia");
  const cursor = index.openCursor(IDBKeyRange.only(id));
  cursor.onsuccess = () => {
    const current = cursor.result;
    if (current) {
      current.delete();
      current.continue();
    }
  };
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function verifyOfflineDownload(download: OfflineDownload) {
  if (download.status !== "ready" || download.size < 1) return false;

  if (download.storageBackend === "opfs") {
    try {
      const file = await getOpfsFile(download.id);
      return Boolean(file && file.size === download.size && download.downloadedBytes === download.size);
    } catch {
      return false;
    }
  }

  if (download.chunkCount < 1) return false;
  let storedBytes = 0;
  for (let index = 0; index < download.chunkCount; index += 1) {
    const chunk = download.storageBackend === "cache"
      ? await getCachedChunk(download.id, index)
      : await getChunk(download.id, index);
    if (!chunk?.byteLength) return false;
    storedBytes += chunk.byteLength;
  }
  return storedBytes === download.size && download.downloadedBytes === download.size;
}

export async function getOfflineDownload(id: string) {
  const cached = await getCachedDownload(id).catch(() => null);
  if (cached) return cached;
  return withDatabaseRetry(async (database) => {
    const result = await requestResult(database.transaction("downloads").objectStore("downloads").get(id)) as OfflineDownload | undefined;
    return result || null;
  }).catch(() => null);
}

export async function listOfflineDownloads() {
  const merged = new Map<string, OfflineDownload>();

  for (const item of await listCachedDownloads().catch(() => [] as OfflineDownload[])) {
    merged.set(item.id, item);
  }

  const legacy = await withDatabaseRetry(async (database) =>
    await requestResult(database.transaction("downloads").objectStore("downloads").getAll()) as OfflineDownload[]
  ).catch(() => [] as OfflineDownload[]);

  for (const item of legacy) {
    if (!merged.has(item.id)) merged.set(item.id, item);
  }

  return [...merged.values()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export async function removeOfflineDownload(id: string) {
  const existing = await getOfflineDownload(id).catch(() => null);

  const database = await openOfflineDatabase();
  const transaction = database.transaction("downloads", "readwrite");
  transaction.objectStore("downloads").delete(id);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  await Promise.allSettled([
    existing?.storageBackend === "idb" ? clearIdbChunks(id) : Promise.resolve(),
    existing?.storageBackend === "cache" ? clearCachedDownload(id, existing.chunkCount) : Promise.resolve(),
    existing?.storageBackend === "opfs" ? removeOpfsFile(id) : Promise.resolve(),
  ]);
}

async function artwork(movie: Movie) {
  if (!movie.posterUrl) return null;
  try {
    const response = await fetch(movie.posterUrl);
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

async function supportsWritableOpfs() {
  const manager = storageManager();
  if (!manager?.getDirectory) return false;

  try {
    const root = await manager.getDirectory();
    const directory = await root.getDirectoryHandle(OPFS_DIR, { create: true });
    const probeName = ".write-probe";
    const handle = await directory.getFileHandle(probeName, { create: true });
    const candidate = handle as FileSystemFileHandle & {
      createWritable?: (options?: { keepExistingData?: boolean }) => Promise<FileSystemWritableFileStream>;
    };
    const supported = typeof candidate.createWritable === "function";
    await directory.removeEntry(probeName).catch(() => undefined);
    return supported;
  } catch {
    return false;
  }
}

async function chooseBackend(existing: OfflineDownload | null): Promise<OfflineBackend> {
  if (existing?.storageBackend === "cache") return "cache";
  if (existing?.storageBackend === "idb") return "idb";
  const writableOpfs = await supportsWritableOpfs();
  if (existing?.storageBackend === "opfs") return writableOpfs ? "opfs" : "cache";
  return writableOpfs ? "opfs" : "cache";
}

async function opfsExistingSize(id: string) {
  const file = await getOpfsFile(id).catch(() => null);
  return file?.size || 0;
}

export async function downloadForOffline(movie: Movie, onProgress: (download: OfflineDownload) => void, signal?: AbortSignal) {
  if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);

  let existing = await getOfflineDownload(movie.id);
  if (existing?.status === "ready" && await verifyOfflineDownload(existing)) return existing;

  const backend = await chooseBackend(existing);

  if (backend === "cache" && existing?.storageBackend === "opfs") {
    await removeOpfsFile(movie.id).catch(() => undefined);
    existing = null;
  }

  let offset = existing?.downloadedBytes || 0;
  let chunkIndex = existing?.chunkCount || 0;

  if (backend === "opfs") {
    const fileSize = await opfsExistingSize(movie.id);
    if (!existing || fileSize !== offset) offset = fileSize;
    chunkIndex = 0;
  }

  const headers: HeadersInit = offset ? { Range: `bytes=${offset}-`, ...(existing?.etag ? { "If-Range": existing.etag } : {}) } : {};
  const response = await fetch(`/api/media/offline/${movie.id}`, { headers, signal });

  if (response.status === 409) {
    const preparation = await fetch(`/api/media/offline/${movie.id}`, { method: "POST" });
    if (!preparation.ok) throw new Error("This title needs compatibility preparation, but the conversion could not be queued.");
    throw new Error("Compatibility preparation was added to the existing conversion queue. Download it after that job finishes—no second conversion will run.");
  }

  if (!response.ok || !response.body) {
    throw new Error(response.status === 401 ? "Sign in again before downloading." : "Could not start this offline download.");
  }

  if (offset && response.status === 200) {
    await removeOfflineDownload(movie.id);
    existing = null;
    offset = 0;
    chunkIndex = 0;
  }

  const contentRange = response.headers.get("content-range");
  const total = Number(contentRange?.split("/")[1] || response.headers.get("x-offline-size") || response.headers.get("content-length") || 0);
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  const available = estimate?.quota && estimate?.usage !== undefined ? estimate.quota - estimate.usage : null;
  if (!offset && available !== null && total > available * 0.9) {
    throw new Error("This device does not have enough available app storage for that title.");
  }

  const now = new Date().toISOString();
  let download: OfflineDownload = existing || {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    fileName: movie.fileName,
    mediaType: movie.mediaType,
    seriesTitle: movie.seriesTitle,
    seasonNumber: movie.seasonNumber,
    episodeNumber: movie.episodeNumber,
    size: total,
    downloadedBytes: offset,
    chunkCount: chunkIndex,
    mime: response.headers.get("content-type") || "video/mp4",
    etag: response.headers.get("etag"),
    status: "downloading",
    createdAt: now,
    updatedAt: now,
    error: null,
    poster: await artwork(movie),
    storageBackend: backend,
    chunkSize: backend === "cache" ? CACHE_CHUNK_SIZE : backend === "idb" ? CHUNK_SIZE : 0,
  };

  download = {
    ...download,
    size: total,
    downloadedBytes: offset,
    storageBackend: backend,
    chunkSize: backend === "cache"
      ? (existing?.chunkSize || CACHE_CHUNK_SIZE)
      : backend === "idb"
        ? (existing?.chunkSize || CHUNK_SIZE)
        : 0,
    status: "downloading",
    error: null,
    updatedAt: now,
  };

  await saveDownload(download);
  onProgress(download);

  const reader = response.body.getReader();
  let lastMetadataWrite = offset;

  if (backend === "opfs") {
    const directory = await getOpfsDirectory(true);
    if (!directory) throw new Error("This browser could not open device storage for offline playback.");
    const fileHandle = await directory.getFileHandle(opfsFileName(movie.id), { create: true });
    const writableHandle = fileHandle as FileSystemFileHandle & {
      createWritable?: (options?: { keepExistingData?: boolean }) => Promise<FileSystemWritableFileStream>;
    };
    if (typeof writableHandle.createWritable !== "function") {
      throw new Error("Writable OPFS is not supported by this browser.");
    }
    const writable = await writableHandle.createWritable({ keepExistingData: true });
    await writable.seek(offset);

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        offset += value.byteLength;

        if (offset - lastMetadataWrite >= 4 * 1024 * 1024) {
          download = { ...download, downloadedBytes: offset, updatedAt: new Date().toISOString() };
          await saveDownload(download);
          onProgress(download);
          lastMetadataWrite = offset;
        }
      }

      await writable.close();
      download = {
        ...download,
        size: total || offset,
        downloadedBytes: offset,
        chunkCount: 0,
        status: "ready",
        updatedAt: new Date().toISOString(),
        error: null,
      };
      await saveDownload(download);

      if (!await verifyOfflineDownload(download)) {
        download = {
          ...download,
          status: "failed",
          error: "The saved copy is incomplete. Tap Resume to finish downloading it.",
          updatedAt: new Date().toISOString(),
        };
        await saveDownload(download);
        onProgress(download);
        throw new Error(download.error!);
      }

      onProgress(download);
      return download;
    } catch (reason) {
      try { await writable.close(); } catch {}
      const paused = signal?.aborted;
      download = {
        ...download,
        downloadedBytes: offset,
        status: paused ? "paused" : "failed",
        updatedAt: new Date().toISOString(),
        error: paused ? null : reason instanceof Error ? reason.message : "Download interrupted.",
      };
      await saveDownload(download);
      onProgress(download);
      if (!paused) throw reason;
      return download;
    }
  }

  let pending = new Uint8Array(0);
  const activeChunkSize = download.chunkSize || (backend === "cache" ? CACHE_CHUNK_SIZE : CHUNK_SIZE);
  const saveChunk = backend === "cache" ? putCachedChunk : putChunk;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      if (!pending.length && value.length >= activeChunkSize) {
        let position = 0;
        while (value.length - position >= activeChunkSize) {
          const chunk = value.slice(position, position + activeChunkSize);
          await saveChunk(movie.id, chunkIndex, chunk.buffer);
          chunkIndex += 1;
          offset += chunk.length;
          position += activeChunkSize;
        }
        pending = value.slice(position);
      } else {
        const joined = new Uint8Array(pending.length + value.length);
        joined.set(pending);
        joined.set(value, pending.length);
        pending = joined;
      }

      while (pending.length >= activeChunkSize) {
        const chunk = pending.slice(0, activeChunkSize);
        pending = pending.slice(activeChunkSize);
        await saveChunk(movie.id, chunkIndex, chunk.buffer);
        chunkIndex += 1;
        offset += chunk.length;
      }

      if (offset - lastMetadataWrite >= 4 * 1024 * 1024) {
        download = { ...download, downloadedBytes: offset, chunkCount: chunkIndex, updatedAt: new Date().toISOString() };
        await saveDownload(download);
        onProgress(download);
        lastMetadataWrite = offset;
      }
    }

    if (pending.length) {
      await saveChunk(movie.id, chunkIndex, pending.buffer);
      chunkIndex += 1;
      offset += pending.length;
    }

    download = {
      ...download,
      size: total || offset,
      downloadedBytes: offset,
      chunkCount: chunkIndex,
      status: "ready",
      updatedAt: new Date().toISOString(),
      error: null,
    };
    await saveDownload(download);

    if (!await verifyOfflineDownload(download)) {
      download = {
        ...download,
        status: "failed",
        error: "The saved copy is incomplete. Tap Resume to finish downloading it.",
        updatedAt: new Date().toISOString(),
      };
      await saveDownload(download);
      onProgress(download);
      throw new Error(download.error!);
    }

    onProgress(download);
    return download;
  } catch (reason) {
    const paused = signal?.aborted;
    download = {
      ...download,
      downloadedBytes: offset,
      chunkCount: chunkIndex,
      status: paused ? "paused" : "failed",
      updatedAt: new Date().toISOString(),
      error: paused ? null : reason instanceof Error ? reason.message : "Download interrupted.",
    };
    await saveDownload(download);
    onProgress(download);
    if (!paused) throw reason;
    return download;
  }
}

export async function offlineStorageEstimate() {
  const estimate = await navigator.storage?.estimate?.();
  return {
    usage: estimate?.usage || 0,
    quota: estimate?.quota || 0,
    persistent: await navigator.storage?.persisted?.().catch(() => false) || false,
  };
}
