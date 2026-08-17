const CACHE = "constants-hub-shell-v2";
const DB_NAME = "constants-hub-offline";
const DB_VERSION = 1;
const CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_RANGE = 4 * 1024 * 1024;
const SHELL = ["/tv", "/tv/offline", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("downloads")) database.createObjectStore("downloads", { keyPath: "id" });
      if (!database.objectStoreNames.contains("chunks")) { const store = database.createObjectStore("chunks", { keyPath: "key" }); store.createIndex("byMedia", "mediaId", { unique: false }); }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getRecord(store, key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => { database.close(); resolve(request.result); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

async function offlineMedia(request, id) {
  const metadata = await getRecord("downloads", id);
  if (!metadata || metadata.status !== "ready") return new Response("Offline title not found.", { status: 404 });
  const size = metadata.size;
  const range = request.headers.get("range");
  if (!range) {
    let index = 0;
    const stream = new ReadableStream({ async pull(controller) { if (index >= metadata.chunkCount) { controller.close(); return; } const chunk = await getRecord("chunks", `${id}:${index}`); if (!chunk) { controller.error(new Error("Offline video chunk is missing.")); return; } controller.enqueue(new Uint8Array(chunk.bytes)); index += 1; } });
    return new Response(stream, { status: 200, headers: { "Content-Type": metadata.mime, "Content-Length": String(size), "Accept-Ranges": "bytes", "Cache-Control": "no-store" } });
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : Math.min(size - 1, start + MAX_RANGE - 1);
  end = Math.min(end, start + MAX_RANGE - 1, size - 1);
  if (start < 0 || end < start || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const first = Math.floor(start / CHUNK_SIZE); const last = Math.floor(end / CHUNK_SIZE);
  const pieces = [];
  for (let index = first; index <= last; index += 1) { const chunk = await getRecord("chunks", `${id}:${index}`); if (!chunk) return new Response("Offline video chunk is missing.", { status: 500 }); pieces.push(new Uint8Array(chunk.bytes)); }
  const joined = new Uint8Array(pieces.reduce((total, item) => total + item.length, 0)); let position = 0; for (const piece of pieces) { joined.set(piece, position); position += piece.length; }
  const offset = start - first * CHUNK_SIZE; const body = joined.slice(offset, offset + end - start + 1);
  return new Response(body, { status: 206, headers: { "Content-Type": metadata.mime, "Content-Length": String(body.length), "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Cache-Control": "no-store" } });
}

self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url)))).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  const request = event.request; const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/__offline/media/")) { event.respondWith(offlineMedia(request, decodeURIComponent(url.pathname.split("/").pop()))); return; }
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).then((response) => { if (response.ok && request.destination !== "video") void caches.open(CACHE).then((cache) => cache.put(request, response.clone())); return response; }).catch(() => caches.match(request).then((cached) => cached || (request.mode === "navigate" ? caches.match("/tv/offline") : undefined) || new Response("Offline", { status: 503 }))));
});
