"use client";

import { useEffect } from "react";

const CACHE = "constants-hub-shell-v6";

async function warmOfflineShell() {
  if (!("caches" in window) || !navigator.onLine) return;
  const cache = await caches.open(CACHE);
  const response = await fetch("/tv/offline", { credentials: "include", cache: "no-store" });
  if (!response.ok) return;

  await cache.put("/tv/offline", response.clone());
  const html = await response.text();
  const documentCopy = new DOMParser().parseFromString(html, "text/html");
  const assetUrls = Array.from(documentCopy.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src],link[href]"))
    .map((node) => node instanceof HTMLScriptElement ? node.src : node.href)
    .filter(Boolean)
    .map((value) => new URL(value, window.location.origin))
    .filter((url) => url.origin === window.location.origin && url.pathname.startsWith("/_next/static/"))
    .map((url) => url.toString());

  await Promise.allSettled(assetUrls.map((url) => cache.add(url)));
}

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    void navigator.serviceWorker.register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => warmOfflineShell())
      .catch(() => undefined);
  }, []);
  return null;
}
