"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Health = { status: "ok" | "degraded"; media: "available" | "unavailable"; tmdbConfigured: boolean };

export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [movieCount, setMovieCount] = useState<number | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [syncingPosters, setSyncingPosters] = useState(false);
  const [posterMessage, setPosterMessage] = useState("");

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const [healthResponse, libraryResponse] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/media/library", { cache: "no-store" }),
      ]);
      const healthResult = await healthResponse.json() as Health;
      const libraryResult = await libraryResponse.json() as { success: boolean; movieCount?: number; scannedAt?: string; error?: string };
      setHealth(healthResult);
      if (!libraryResponse.ok || !libraryResult.success) throw new Error(libraryResult.error || "Library scan failed.");
      setMovieCount(libraryResult.movieCount ?? 0);
      setLastScan(libraryResult.scannedAt ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "System check failed.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function syncPosters() {
    setSyncingPosters(true); setPosterMessage(""); setError("");
    try {
      const response = await fetch("/api/media/artwork/sync", { method: "POST" });
      const result = await response.json() as { success: boolean; message?: string; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "Poster sync failed.");
      setPosterMessage(result.message || "Poster sync completed.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Poster sync failed."); }
    finally { setSyncingPosters(false); }
  }

  return <main className="admin-shell">
    <header className="admin-header"><div><Link href="/tv">← TV Mode</Link><p className="eyebrow">CONSTANT’S HUB</p><h1>System Status</h1></div><button className="primary-button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Checking…" : "Refresh"}</button></header>
    {error ? <div className="state-card error">{error}</div> : null}
    <section className="status-grid">
      <StatusCard label="Synology NAS" title="Media Storage" state={health?.media === "available" ? "Connected" : health ? "Unavailable" : "Checking"} good={health?.media === "available"}><p>The configured MEDIA_ROOT is checked directly by the server.</p></StatusCard>
      <StatusCard label="Movie Metadata" title="TMDB" state={health?.tmdbConfigured ? "Configured" : health ? "Optional" : "Checking"} good={Boolean(health?.tmdbConfigured)}><p>Metadata enriches the catalog when available; local titles and artwork remain the fallback.</p></StatusCard>
      <StatusCard label="Library" title="Movies Ready" state={movieCount === null ? "Checking" : String(movieCount)} good={movieCount !== null}><p>{lastScan ? `Last scanned ${new Date(lastScan).toLocaleString()}.` : "Waiting for the first scan."}</p></StatusCard>
      <StatusCard label="Playback" title="Secure Streaming" state="Ready" good><p>ID-based streaming supports byte ranges, seeking, and Resume playback.</p></StatusCard>
    </section>
    <section className="admin-panel"><p className="eyebrow">MEDIA TOOLS</p><h2>Compatibility & Organizer</h2><p>Inspect real codecs, convert incompatible movies for mobile playback, and safely organize Inbox files.</p><div className="hero-actions"><Link className="secondary-button" href="/settings/media">Media Compatibility</Link><Link className="secondary-button" href="/organize">Open Organizer</Link></div></section>
    <section className="admin-panel"><p className="eyebrow">SAMSUNG TV ARTWORK</p><h2>Sync Missing Posters</h2><p>Downloads missing TMDB artwork as both poster.jpg and folder.jpg beside each movie. Synology Media Server still needs to re-index before its DLNA thumbnails update.</p><button className="secondary-button" disabled={syncingPosters} onClick={() => void syncPosters()}>{syncingPosters ? "Syncing…" : "Sync Missing Posters"}</button>{posterMessage ? <p className="artwork-ready">{posterMessage}</p> : null}</section>
  </main>;
}

function StatusCard({ label, title, state, good, children }: { label: string; title: string; state: string; good: boolean; children: React.ReactNode }) {
  return <article className="status-card"><div className="status-card-top"><div><small>{label}</small><h2>{title}</h2></div><span className={good ? "status-good" : "status-neutral"}>{state}</span></div>{children}</article>;
}
