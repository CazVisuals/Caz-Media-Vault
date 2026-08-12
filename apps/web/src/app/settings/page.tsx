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

  return <main className="admin-shell">
    <header className="admin-header"><div><Link href="/tv">← TV Mode</Link><p className="eyebrow">CAZ MEDIA VAULT</p><h1>System Status</h1></div><button className="primary-button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Checking…" : "Refresh"}</button></header>
    {error ? <div className="state-card error">{error}</div> : null}
    <section className="status-grid">
      <StatusCard label="Synology NAS" title="Media Storage" state={health?.media === "available" ? "Connected" : health ? "Unavailable" : "Checking"} good={health?.media === "available"}><p>The configured MEDIA_ROOT is checked directly by the server.</p></StatusCard>
      <StatusCard label="Movie Metadata" title="TMDB" state={health?.tmdbConfigured ? "Configured" : health ? "Optional" : "Checking"} good={Boolean(health?.tmdbConfigured)}><p>Metadata enriches the catalog when available; local titles and artwork remain the fallback.</p></StatusCard>
      <StatusCard label="Library" title="Movies Ready" state={movieCount === null ? "Checking" : String(movieCount)} good={movieCount !== null}><p>{lastScan ? `Last scanned ${new Date(lastScan).toLocaleString()}.` : "Waiting for the first scan."}</p></StatusCard>
      <StatusCard label="Playback" title="Secure Streaming" state="Ready" good><p>ID-based streaming supports byte ranges, seeking, and Resume playback.</p></StatusCard>
    </section>
    <section className="admin-panel"><p className="eyebrow">ORGANIZER</p><h2>Inbox-only safety</h2><p>Organizer mutations are limited to files already inside Inbox. Existing destinations are never overwritten.</p><Link className="secondary-button" href="/organize">Open Organizer</Link></section>
  </main>;
}

function StatusCard({ label, title, state, good, children }: { label: string; title: string; state: string; good: boolean; children: React.ReactNode }) {
  return <article className="status-card"><div className="status-card-top"><div><small>{label}</small><h2>{title}</h2></div><span className={good ? "status-good" : "status-neutral"}>{state}</span></div>{children}</article>;
}
