"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Movie } from "@/lib/media/types";
import type { MediaProbe } from "@/lib/media/probe";

type Inspection = { movie: Movie; probe?: MediaProbe; error?: string };
type PcWorkerStatus = {
  status?: string;
  reason?: string;
  source?: string;
  output?: string;
  mode?: string;
  updatedAt?: string;
  computer?: string;
  override?: boolean;
};
type PcWorker = { success: boolean; enabled?: boolean; status?: PcWorkerStatus | null; error?: string };

export default function MediaToolsPage() {
  const [items, setItems] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pcWorker, setPcWorker] = useState<PcWorker | null>(null);
  const [pcOnline, setPcOnline] = useState(false);
  const [pcBusy, setPcBusy] = useState(false);
  const [pcMessage, setPcMessage] = useState("");

  async function refreshPc() {
    const response = await fetch("/api/admin/pc-worker", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as PcWorker;
    setPcWorker(result);
    const updatedAt = result.status?.updatedAt ? new Date(result.status.updatedAt).getTime() : 0;
    setPcOnline(Boolean(updatedAt && Date.now() - updatedAt < 30000));
  }

  async function refreshLibrary() {
    const response = await fetch("/api/media/library", { cache: "no-store" });
    const result = await response.json() as { movies?: Movie[]; error?: string };
    if (!response.ok) throw new Error(result.error || "Library unavailable.");
    const inspections = await Promise.all((result.movies || []).map(async (movie) => {
      try {
        const probeResponse = await fetch(`/api/media/inspect?path=${encodeURIComponent(movie.relativePath)}`, { cache: "no-store" });
        const probeResult = await probeResponse.json() as { probe?: MediaProbe; error?: string };
        return probeResponse.ok && probeResult.probe ? { movie, probe: probeResult.probe } : { movie, error: probeResult.error || "Inspection failed." };
      } catch {
        return { movie, error: "Inspection failed." };
      }
    }));
    setItems(inspections);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await Promise.all([refreshLibrary(), refreshPc()]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Media inspection failed.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const pcInterval = window.setInterval(() => { if (active) void refreshPc(); }, 3000);
    const libraryInterval = window.setInterval(() => { if (active) void refreshLibrary().catch(() => undefined); }, 20000);
    return () => {
      active = false;
      window.clearInterval(pcInterval);
      window.clearInterval(libraryInterval);
    };
  }, []);

  async function pcCommand(action: "enable" | "run-now" | "pause" | "resume" | "stop") {
    setPcBusy(true);
    setPcMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/pc-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json() as PcWorker;
      if (!response.ok || !result.success) throw new Error(result.error || "PC worker command failed.");
      setPcWorker(result);
      const updatedAt = result.status?.updatedAt ? new Date(result.status.updatedAt).getTime() : 0;
      setPcOnline(Boolean(updatedAt && Date.now() - updatedAt < 30000));
      setPcMessage(action === "run-now" ? "Convert Now sent to CAZ-PC." : action === "pause" ? "Pause sent to CAZ-PC." : action === "resume" ? "Resume sent to CAZ-PC." : "PC worker enabled.");
      window.setTimeout(() => void refreshPc(), 1200);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PC worker command failed.");
    } finally {
      setPcBusy(false);
    }
  }

  const pc = pcWorker?.status;
  const pending = items.filter((item) => item.probe && !item.probe.mobileCompatible);
  const ready = items.filter((item) => item.probe?.mobileCompatible).length;
  const total = items.filter((item) => item.probe).length;
  const readyPercent = total ? Math.round((ready / total) * 100) : 0;
  const currentSource = pc?.source || "";
  const currentFile = currentSource.split("\\").pop() || "";
  const workerLabel = !pcOnline ? "Offline" : pc?.status === "converting" ? "Converting" : pc?.status === "copying" ? "Copying to NAS" : pc?.status === "paused" ? "Paused" : pc?.status === "waiting" ? "Connected / waiting" : pc?.status || "Connected";
  const activeMode = pc?.mode === "remux" ? "Quick remux" : pc?.mode === "audio" ? "Audio conversion" : pc?.mode === "transcode" ? "RTX NVENC transcode" : null;

  return <main className="admin-shell">
    <header className="admin-header">
      <div><Link href="/settings">← System Status</Link><p className="eyebrow">MEDIA HEALTH</p><h1>Compatibility & Conversion</h1></div>
      <div className="conversion-controls">
        <button className="secondary-button" disabled={pcBusy || !pcWorker?.enabled} onClick={() => void pcCommand("pause")}>Ⅱ Pause</button>
        <button className="secondary-button" disabled={pcBusy || !pcWorker?.enabled} onClick={() => void pcCommand("resume")}>▶ Resume</button>
        <button className="primary-button" disabled={pcBusy || !pcWorker?.enabled || !pcOnline} onClick={() => void pcCommand("run-now")}>{pcBusy ? "Sending…" : `Convert now (${pending.length})`}</button>
      </div>
    </header>

    <section className="admin-panel">
      <div className="queue-heading">
        <div><p className="eyebrow">CAZ-PC CONVERSION WORKER</p><h2>{workerLabel}</h2></div>
        <span className={pcOnline ? "status-good" : "status-neutral"}>{pcOnline ? pc?.computer || "PC connected" : "Waiting for PC"}</span>
      </div>
      <div className="queue-overall"><span style={{ width: `${readyPercent}%` }} /></div>
      <p><strong>{ready} of {total}</strong> inspected files are mobile ready · <strong>{pending.length}</strong> remaining.</p>
      <p>{pcOnline ? pc?.reason ? `${pc.reason}.` : pc?.override ? "Daytime Convert Now override is active." : "Worker is connected and ready." : "The site has not received a fresh heartbeat from the Windows worker."}</p>
      {currentFile ? <p><strong>Current file:</strong> {currentFile}{activeMode ? ` · ${activeMode}` : ""}</p> : null}
      {pc?.updatedAt ? <small>Last update: {new Date(pc.updatedAt).toLocaleTimeString()}</small> : null}
      {!pcWorker?.enabled ? <div className="hero-actions"><button className="secondary-button" disabled={pcBusy} onClick={() => void pcCommand("enable")}>Enable PC Worker</button></div> : null}
      {pcMessage ? <p className="artwork-ready">{pcMessage}</p> : null}
    </section>

    {error ? <div className="state-card error">{error}</div> : null}
    {loading ? <div className="state-card">Inspecting your library…</div> : null}

    {!loading ? <section className="admin-panel">
      <div className="queue-heading"><div><p className="eyebrow">CAZ-PC QUEUE</p><h2>{pending.length ? `${pending.length} waiting for conversion` : "All inspected media is ready"}</h2></div></div>
      {pending.length ? pending.map(({ movie, probe }) => {
        const isCurrent = Boolean(currentFile && movie.fileName.toLowerCase() === currentFile.toLowerCase());
        const label = isCurrent && pc?.status === "copying" ? "Copying" : isCurrent ? "Converting" : "Queued";
        const mode = probe?.conversionMode === "remux" ? "Quick remux" : probe?.conversionMode === "audio-convert" ? "Audio conversion" : "RTX NVENC";
        return <div className="queue-row" key={movie.id}>
          <div><strong>{movie.relativePath}</strong><small>{mode}</small></div>
          <span className={isCurrent ? "queue-converting" : "queue-queued"}>{label}</span>
          <div className="job-progress"><span style={{ width: isCurrent ? "65%" : "0%" }} /></div>
        </div>;
      }) : <div className="state-card"><strong>Queue complete</strong><small>CAZ-PC has no incompatible files waiting.</small></div>}
    </section> : null}

    <p className="overview">This page now uses CAZ-PC as the only active conversion source. The NAS stores media and worker status only; it does not run FFmpeg conversions.</p>

    <section className="organizer-list">{items.map(({ movie, probe, error: inspectError }) => <article className="media-health-card" key={movie.id}><div><h2>{movie.title}</h2><p>{movie.fileName}</p></div>{probe ? <><div className="codec-list"><span>{probe.container}</span><span>Video: {probe.videoCodec || "unknown"}</span><span>Audio: {probe.audioCodec || "none"}</span>{probe.width ? <span>{probe.width}×{probe.height}</span> : null}</div><strong className={probe.mobileCompatible ? "status-good" : "status-neutral"}>{probe.mobileCompatible ? "Mobile ready" : probe.conversionMode === "remux" ? "Quick remux" : probe.conversionMode === "audio-convert" ? "Fast audio fix" : "Full conversion"}</strong></> : <span className="state-card error">{inspectError}</span>}</article>)}</section>
  </main>;
}
