const CACHE = "constants-hub-shell-v8";
const DB_NAME = "constants-hub-offline";
const DB_VERSION = 1;
const LEGACY_CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_RANGE = 4 * 1024 * 1024;
const SHELL = ["/tv", "/tv/offline", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];

function openDatabase() {
  return new Promise((resolve, reject) => {
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

function mediaHeaders(metadata, length, extra = {}) {
  return {
    "Content-Type": metadata.mime || "video/mp4",
    "Content-Length": String(length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    ...extra,
  };
}

async function getOpfsFile(id) {
  const manager = self.navigator?.storage;
  if (!manager?.getDirectory) return null;
  try {
    const root = await manager.getDirectory();
    const directory = await root.getDirectoryHandle("offline-media");
    const handle = await directory.getFileHandle(`${encodeURIComponent(id)}.media`);
    return await handle.getFile();
  } catch (error) {
    if (error && error.name === "NotFoundError") return null;
    throw error;
  }
}

async function offlineMedia(request, id) {
  const metadata = await getRecord("downloads", id);
  if (!metadata || metadata.status !== "ready") return new Response("Offline title not found.", { status: 404 });

  const size = Number(metadata.size || 0);
  if (!size) return new Response("Offline title is invalid.", { status: 500 });

  const opfsFile = metadata.storageBackend === "opfs" ? await getOpfsFile(id) : null;
  if (metadata.storageBackend === "opfs" && (!opfsFile || opfsFile.size !== size)) {
    return new Response("Offline file is missing or incomplete.", { status: 500 });
  }

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: mediaHeaders(metadata, size) });
  }

  const range = request.headers.get("range");
  if (!range) {
    if (opfsFile) {
      return new Response(opfsFile.stream(), { status: 200, headers: mediaHeaders(metadata, size) });
    }
    let index = 0;
    const stream = new ReadableStream({
      async pull(controller) {
        if (index >= metadata.chunkCount) { controller.close(); return; }
        const chunk = await getRecord("chunks", `${id}:${index}`);
        if (!chunk) { controller.error(new Error("Offline video chunk is missing.")); return; }
        controller.enqueue(new Uint8Array(chunk.bytes));
        index += 1;
      },
    });
    return new Response(stream, { status: 200, headers: mediaHeaders(metadata, size) });
  }

  const match = /^bytes=(\d*)-(\d*)$/u.exec(range.trim());
  if (!match || (!match[1] && !match[2])) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }

  let start;
  let end;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
    if (end - start + 1 > MAX_RANGE) start = Math.max(end - MAX_RANGE + 1, 0);
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : Math.min(size - 1, start + MAX_RANGE - 1);
    if (end - start + 1 > MAX_RANGE) end = start + MAX_RANGE - 1;
  }

  end = Math.min(end, size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }

  let body;
  if (opfsFile) {
    body = new Uint8Array(await opfsFile.slice(start, end + 1).arrayBuffer());
  } else {
    const chunkSize = Number(metadata.chunkSize || LEGACY_CHUNK_SIZE);
    const first = Math.floor(start / chunkSize);
    const last = Math.floor(end / chunkSize);
    const pieces = [];

    for (let index = first; index <= last; index += 1) {
      const chunk = await getRecord("chunks", `${id}:${index}`);
      if (!chunk) return new Response("Offline video chunk is missing.", { status: 500 });
      pieces.push(new Uint8Array(chunk.bytes));
    }

    const joined = new Uint8Array(pieces.reduce((total, item) => total + item.length, 0));
    let position = 0;
    for (const piece of pieces) { joined.set(piece, position); position += piece.length; }

    const offset = start - first * chunkSize;
    body = joined.slice(offset, offset + end - start + 1);
  }
  return new Response(body, {
    status: 206,
    headers: mediaHeaders(metadata, body.length, { "Content-Range": `bytes ${start}-${end}/${size}` }),
  });
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("constants-hub-shell-") && key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/__offline/media/") && (request.method === "GET" || request.method === "HEAD")) {
    event.respondWith(offlineMedia(request, decodeURIComponent(url.pathname.split("/").pop() || "")));
    return;
  }

  if (request.method !== "GET") return;

  if (url.origin === self.location.origin && request.mode === "navigate" && url.pathname.startsWith("/tv")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && (url.pathname === "/tv" || url.pathname === "/tv/offline")) {
            void caches.open(CACHE).then((cache) => cache.put(url.pathname, response.clone()));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (await cache.match("/tv/offline")) || new Response("Offline library unavailable. Reconnect once and open Downloads to prepare offline mode.", { status: 503 });
        })
    );
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request).catch(() => caches.match(request)));
    return;
  }

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/settings") ||
    url.pathname.startsWith("/organize") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/invite/")
  ) return;

  const cacheable = SHELL.includes(url.pathname) || url.pathname.startsWith("/icon-") || url.pathname === "/icon.svg";
  if (!cacheable) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.destination !== "video") void caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      })
      .catch(() => caches.match(request).then(
        (cached) => cached || (request.mode === "navigate" ? caches.match("/tv/offline") : undefined) || new Response("Offline", { status: 503 })
      ))
  );
});
