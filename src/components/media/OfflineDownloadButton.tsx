"use client";

import { useEffect, useRef, useState } from "react";
import type { Movie } from "@/lib/media/types";
import { downloadForOffline, getOfflineDownload, removeOfflineDownload, type OfflineDownload } from "@/lib/offline/client";

export function OfflineDownloadButton({ movie, compact = false }: { movie: Movie; compact?: boolean }) {
  const [download, setDownload] = useState<OfflineDownload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { void getOfflineDownload(movie.id).then(setDownload).catch(() => undefined); return () => controller.current?.abort(); }, [movie.id]);
  async function start() { setBusy(true); setError(""); controller.current = new AbortController(); try { await downloadForOffline(movie, setDownload, controller.current.signal); } catch (reason) { setError(reason instanceof Error ? reason.message : "Download failed."); } finally { setBusy(false); controller.current = null; } }
  async function remove() { await removeOfflineDownload(movie.id); setDownload(null); setError(""); }
  const percent = download?.size ? Math.min(100, Math.round(download.downloadedBytes / download.size * 100)) : 0;
  return <div className={`offline-control${compact ? " compact" : ""}`}>
    {download?.status === "ready" ? <><span className="offline-ready">✓ Available offline</span><button className="secondary-button focusable" data-focusable="true" onClick={() => void remove()}>Remove</button></> : busy ? <><button className="secondary-button focusable" data-focusable="true" onClick={() => controller.current?.abort()}>Ⅱ Pause {percent}%</button><span className="offline-progress"><i style={{ width: `${percent}%` }} /></span></> : <button className="secondary-button focusable" data-focusable="true" onClick={() => void start()}>{download?.status === "paused" || download?.status === "failed" ? `↓ Resume ${percent}%` : "↓ Download"}</button>}
    {error || download?.error ? <small className="offline-error">{error || download?.error}</small> : null}
  </div>;
}
