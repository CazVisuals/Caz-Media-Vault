"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Health = { status: "ok" | "degraded"; media: "available" | "unavailable"; tmdbConfigured: boolean };
type Dashboard = { movies: number; shows: number; episodes: number; storageBytes: number; missingPosters: number; recentlyAdded: string[]; conversions: { queued: number; failed: number; completed: number }; streaming: boolean; conversionWindowOpen: boolean };

export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [movieCount, setMovieCount] = useState<number | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [syncingPosters, setSyncingPosters] = useState(false);
  const [posterMessage, setPosterMessage] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const [healthResponse, libraryResponse, dashboardResponse] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/media/library", { cache: "no-store" }),
        fetch("/api/admin/dashboard", { cache: "no-store" }),
      ]);
      const healthResult = await healthResponse.json() as Health;
      const libraryResult = await libraryResponse.json() as { success: boolean; movieCount?: number; scannedAt?: string; error?: string };
      setHealth(healthResult);
      if (dashboardResponse.ok) setDashboard(await dashboardResponse.json() as Dashboard);
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

  async function restoreBackup(file: File | undefined) {
    if (!file || !window.confirm("Restore profiles, progress, and watchlists from this backup?")) return;
    setError("");
    try {
      const response = await fetch("/api/admin/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Restore failed.");
      window.alert("Backup restored. Existing logins may need to sign in again.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Restore failed."); }
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
    {dashboard ? <section className="admin-panel"><p className="eyebrow">LIBRARY DASHBOARD</p><h2>At a glance</h2><div className="metric-grid"><div><strong>{dashboard.movies}</strong><span>Movies</span></div><div><strong>{dashboard.shows}</strong><span>Shows</span></div><div><strong>{dashboard.episodes}</strong><span>Episodes</span></div><div><strong>{(dashboard.storageBytes / 1073741824).toFixed(1)} GB</strong><span>Media storage</span></div><div><strong>{dashboard.missingPosters}</strong><span>Missing posters</span></div><div><strong>{dashboard.conversions.failed}</strong><span>Failed conversions</span></div></div><p>{dashboard.streaming ? "Streaming detected — conversion CPU is automatically paused." : dashboard.conversionWindowOpen ? "Overnight conversion window is open." : "Conversions are waiting for the overnight window."}</p>{dashboard.recentlyAdded.length ? <p><strong>Recently added:</strong> {dashboard.recentlyAdded.join(", ")}</p> : null}</section> : null}
    <section className="admin-panel"><p className="eyebrow">OWNER ACCESS</p><h2>Household Profiles</h2><p>Create Family, Kids, and expiring Guest accounts. Only the Owner can see or open these settings.</p><Link className="secondary-button" href="/settings/profiles">Manage Profiles</Link></section>
    <section className="admin-panel"><p className="eyebrow">MEDIA TOOLS</p><h2>Compatibility & Organizer</h2><p>Inspect real codecs, convert incompatible movies for mobile playback, organize Inbox files, and build household collections.</p><div className="hero-actions"><Link className="secondary-button" href="/settings/media">Media Compatibility</Link><Link className="secondary-button" href="/organize">Open Organizer</Link><Link className="secondary-button" href="/settings/collections">Custom Collections</Link></div></section>
    <section className="admin-panel"><p className="eyebrow">SAMSUNG TV ARTWORK</p><h2>Sync Missing Posters</h2><p>Downloads missing TMDB artwork as both poster.jpg and folder.jpg beside each movie. Synology Media Server still needs to re-index before its DLNA thumbnails update.</p><button className="secondary-button" disabled={syncingPosters} onClick={() => void syncPosters()}>{syncingPosters ? "Syncing…" : "Sync Missing Posters"}</button>{posterMessage ? <p className="artwork-ready">{posterMessage}</p> : null}</section>
    <section className="admin-panel"><p className="eyebrow">BACKUP & RECOVERY</p><h2>Protect household data</h2><p>Export profiles, password hashes, viewing progress, watchlists, a library snapshot, and non-secret conversion settings. Media files and environment secrets are never included.</p><div className="hero-actions"><a className="secondary-button" href="/api/admin/backup" download>Export Backup</a><label className="secondary-button">Restore Backup<input hidden type="file" accept="application/json,.json" onChange={(event) => void restoreBackup(event.target.files?.[0])} /></label></div></section>
  </main>;
}

function StatusCard({ label, title, state, good, children }: { label: string; title: string; state: string; good: boolean; children: React.ReactNode }) {
  return <article className="status-card"><div className="status-card-top"><div><small>{label}</small><h2>{title}</h2></div><span className={good ? "status-good" : "status-neutral"}>{state}</span></div>{children}</article>;
}
