"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TvSidebar } from "@/components/media/TvSidebar";
import { listOfflineDownloads, offlineStorageEstimate, removeOfflineDownload, type OfflineDownload } from "@/lib/offline/client";

function bytes(value: number) { if (!value) return "0 MB"; return value >= 1073741824 ? `${(value / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(value / 1048576))} MB`; }

export default function OfflineLibraryPage() {
  const [downloads, setDownloads] = useState<OfflineDownload[]>([]);
  const [storage, setStorage] = useState({ usage: 0, quota: 0, persistent: false });
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const refresh = useCallback(async () => { setDownloads(await listOfflineDownloads()); setStorage(await offlineStorageEstimate()); }, []);
  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); const change = () => setOnline(navigator.onLine); window.addEventListener("online", change); window.addEventListener("offline", change); return () => { window.clearTimeout(initial); window.removeEventListener("online", change); window.removeEventListener("offline", change); }; }, [refresh]);
  const ready = useMemo(() => downloads.filter((item) => item.status === "ready"), [downloads]);
  async function remove(id: string) { await removeOfflineDownload(id); await refresh(); }
  async function clear() { for (const item of downloads) await removeOfflineDownload(item.id); await refresh(); }
  return <main className="browse-shell"><TvSidebar /><header className="browse-header"><div><p className="eyebrow">TRAVEL LIBRARY</p><h1>Offline</h1><p>{online ? "Choose Download on any title before leaving home." : "Airplane mode ready — playing only from this device."}</p></div><span className={`connection-pill ${online ? "online" : "offline"}`}>{online ? "● Online" : "● Offline"}</span></header>
    <section className="offline-storage-card"><div><strong>{bytes(storage.usage)} used</strong><span>{storage.quota ? `${bytes(Math.max(0, storage.quota - storage.usage))} available to this app` : "Storage availability is managed by this device"}</span></div><div className="storage-meter"><i style={{ width: `${storage.quota ? Math.min(100, storage.usage / storage.quota * 100) : 0}%` }} /></div><small>{storage.persistent ? "Persistent storage granted" : "The browser may reclaim downloads if device storage becomes low"}</small>{downloads.length ? <button className="secondary-button" onClick={() => void clear()}>Remove all</button> : null}</section>
    {!ready.length ? <section className="state-card"><strong>No completed downloads yet</strong><small>Open a movie or episode and select Download. It will stay inside Constant’s Hub rather than appearing in Files.</small><Link href="/tv" className="primary-button">Browse Library</Link></section> : <section className="offline-grid">{ready.map((item) => <article className="offline-card" key={item.id}>{item.poster ? <OfflinePoster blob={item.poster} title={item.title} /> : <div className="offline-poster-fallback">CH</div>}<div><small>{item.mediaType === "tv" ? `${item.seriesTitle || "TV Show"} · S${String(item.seasonNumber || 0).padStart(2, "0")}E${String(item.episodeNumber || 0).padStart(2, "0")}` : "MOVIE"}</small><h2>{item.title}</h2><p>{bytes(item.size)} · Ready offline</p><div className="hero-actions"><Link className="primary-button" href={`/tv/watch/${item.id}`}>▶ Play</Link><button className="secondary-button" onClick={() => void remove(item.id)}>Remove</button></div></div></article>)}</section>}
  </main>;
}

function OfflinePoster({ blob, title }: { blob: Blob; title: string }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img /* eslint-disable-line @next/next/no-img-element -- object URL is device-local artwork */ src={url} alt={`${title} poster`} />;
}
