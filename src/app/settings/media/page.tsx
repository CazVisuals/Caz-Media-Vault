"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Movie } from "@/lib/media/types";
import type { MediaProbe } from "@/lib/media/probe";
import type { ConversionJob } from "@/lib/media/conversion";

type Inspection = { movie: Movie; probe?: MediaProbe; error?: string };
type PcWorkerStatus = {
  status?: string;
  reason?: string;
  source?: string;
  mode?: string;
  updatedAt?: string;
  computer?: string;
  override?: boolean;
};
type PcWorker = { success: boolean; enabled?: boolean; status?: PcWorkerStatus | null; error?: string };

export default function MediaToolsPage() {
  const [items, setItems] = useState<Inspection[]>([]);
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [policyReason, setPolicyReason] = useState<string | null>(null);
  const [overrideActive, setOverrideActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [pcWorker, setPcWorker] = useState<PcWorker | null>(null);
  const [pcOnline, setPcOnline] = useState(false);
  const [pcBusy, setPcBusy] = useState(false);
  const [pcMessage, setPcMessage] = useState("");

  async function refreshJobs() {
    const [conversionResponse, pcResponse] = await Promise.all([
      fetch("/api/media/conversions", { cache: "no-store" }),
      fetch("/api/admin/pc-worker", { cache: "no-store" }),
    ]);
    const result = await conversionResponse.json() as { jobs?: ConversionJob[]; paused?: boolean; policyReason?: string | null; overrideActive?: boolean };
    if (conversionResponse.ok) {
      setJobs(result.jobs || []);
      setPaused(Boolean(result.paused));
      setPolicyReason(result.policyReason || null);
      setOverrideActive(Boolean(result.overrideActive));
    }
    if (pcResponse.ok) {
      const pcResult = await pcResponse.json() as PcWorker;
      setPcWorker(pcResult);
      const updatedAt = pcResult.status?.updatedAt ? new Date(pcResult.status.updatedAt).getTime() : 0;
      setPcOnline(Boolean(updatedAt && Date.now() - updatedAt < 30000));
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/media/library", { cache: "no-store" });
        const result = await response.json() as { movies?: Movie[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Library unavailable.");
        const inspections = await Promise.all((result.movies || []).map(async (movie) => {
          try {
            const probeResponse = await fetch(`/api/media/inspect?path=${encodeURIComponent(movie.relativePath)}`, { cache: "no-store" });
            const probeResult = await probeResponse.json() as { probe?: MediaProbe; error?: string };
            return probeResponse.ok && probeResult.probe ? { movie, probe: probeResult.probe } : { movie, error: probeResult.error || "Inspection failed." };
          } catch { return { movie, error: "Inspection failed." }; }
        }));
        if (active) setItems(inspections);
        await refreshJobs();
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Media inspection failed.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const interval = window.setInterval(() => void refreshJobs(), 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  async function pcCommand(action: "enable" | "run-now" | "pause" | "resume" | "stop") {
    setPcBusy(true); setPcMessage(""); setError("");
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
      window.setTimeout(() => void refreshJobs(), 1200);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PC worker command failed.");
    } finally {
      setPcBusy(false);
    }
  }

  async function clearHistory(action: "clear-failed" | "clear-finished") {
    setError("");
    try {
      const response = await fetch("/api/media/conversions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json() as { jobs?: ConversionJob[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not clear conversion history.");
      setJobs(result.jobs || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not clear conversion history."); }
  }

  const incompatible = items.filter((item) => item.probe && !item.probe.mobileCompatible).length;
  const pc = pcWorker?.status;
  const workerLabel = !pcOnline ? "Offline" : pc?.status === "converting" ? "Converting" : pc?.status === "copying" ? "Copying to NAS" : pc?.status === "paused" ? "Paused" : pc?.status === "waiting" ? "Connected / waiting" : pc?.status || "Connected";
  const currentFile = pc?.source?.split("\\").pop();
  const modeLabel = pc?.mode === "remux" ? "Quick remux" : pc?.mode === "audio" ? "Audio conversion" : pc?.mode === "transcode" ? "RTX NVENC transcode" : null;

  return <main className="admin-shell">
    <header className="admin-header"><div><Link href="/settings">← System Status</Link><p className="eyebrow">MEDIA HEALTH</p><h1>Compatibility & Conversion</h1></div><div className="conversion-controls"><button className="secondary-button" disabled={pcBusy || !pcWorker?.enabled} onClick={() => void pcCommand("pause")}>Ⅱ Pause</button><button className="secondary-button" disabled={pcBusy || !pcWorker?.enabled} onClick={() => void pcCommand("resume")}>▶ Resume</button><button className="primary-button" disabled={pcBusy || !pcWorker?.enabled || !pcOnline} onClick={() => void pcCommand("run-now")}>{pcBusy ? "Sending…" : `Convert now (${incompatible})`}</button></div></header>

    <section className="admin-panel">
      <div className="queue-heading"><div><p className="eyebrow">PC CONVERSION WORKER</p><h2>{workerLabel}</h2></div><span className={pcOnline ? "status-good" : "status-neutral"}>{pcOnline ? pc?.computer || "PC connected" : "Waiting for PC"}</span></div>
      <div className="queue-overall"><span style={{ width: pc?.status === "converting" || pc?.status === "copying" ? "65%" : pcOnline ? "100%" : "0%" }} /></div>
      <p>{pcOnline ? pc?.reason ? `${pc.reason}.` : pc?.override ? "Daytime Convert Now override is active." : "Worker is connected and ready." : "The site has not received a fresh heartbeat from the Windows worker."}</p>
      {currentFile ? <p><strong>Current file:</strong> {currentFile}{modeLabel ? ` · ${modeLabel}` : ""}</p> : null}
      {pc?.updatedAt ? <small>Last update: {new Date(pc.updatedAt).toLocaleTimeString()}</small> : null}
      {!pcWorker?.enabled ? <div className="hero-actions"><button className="secondary-button" disabled={pcBusy} onClick={() => void pcCommand("enable")}>Enable PC Worker</button></div> : null}
      {pcMessage ? <p className="artwork-ready">{pcMessage}</p> : null}
    </section>

    <p className="overview">FFprobe checks the real container and codecs. Compatible video is copied into MP4 without re-encoding; audio alone is converted when needed. Incompatible video uses the RTX PC worker when enabled. Originals are archived, never deleted.</p>
    {error ? <div className="state-card error">{error}</div> : null}
    {loading ? <div className="state-card">Inspecting your library…</div> : null}

    {jobs.length ? <section className="admin-panel"><div className="queue-heading"><div><p className="eyebrow">NAS CONVERSION HISTORY</p><h2>{jobs.filter((job) => job.status === "completed").length} of {jobs.length} completed</h2></div><div className="queue-actions"><button className="secondary-button" onClick={() => void clearHistory("clear-failed")}>Clear failed</button><button className="secondary-button" onClick={() => void clearHistory("clear-finished")}>Clear finished</button></div></div><p>{paused ? "NAS-side conversions are paused while the PC worker is in use." : overrideActive ? "A NAS conversion override is active." : policyReason || "NAS conversion queue is idle."}</p><div className="queue-overall"><span style={{ width: `${jobs.length ? Math.round((jobs.filter((job) => job.status === "completed").length / jobs.length) * 100) : 0}%` }} /></div>{jobs.map((job) => { const label = job.mode === "remux" ? "Quick remux" : job.mode === "audio-convert" ? "Audio conversion" : "Full conversion"; return <div className="queue-row" key={job.id}><strong>{job.source}</strong><span className={`queue-${job.status}`}>{job.status === "converting" ? label : job.status}{job.status === "converting" && typeof job.progress === "number" ? ` · ${job.progress}%` : ""}</span>{job.status === "converting" || job.status === "queued" ? <div className="job-progress"><span style={{ width: `${job.progress || 0}%` }} /></div> : null}{job.error ? <small>{job.error}</small> : null}</div>; })}</section> : null}

    <section className="organizer-list">{items.map(({ movie, probe, error: inspectError }) => <article className="media-health-card" key={movie.id}><div><h2>{movie.title}</h2><p>{movie.fileName}</p></div>{probe ? <><div className="codec-list"><span>{probe.container}</span><span>Video: {probe.videoCodec || "unknown"}</span><span>Audio: {probe.audioCodec || "none"}</span>{probe.width ? <span>{probe.width}×{probe.height}</span> : null}</div><strong className={probe.mobileCompatible ? "status-good" : "status-neutral"}>{probe.mobileCompatible ? "Mobile ready" : probe.conversionMode === "remux" ? "Quick remux" : probe.conversionMode === "audio-convert" ? "Fast audio fix" : "Full conversion"}</strong></> : <span className="state-card error">{inspectError}</span>}</article>)}</section>
  </main>;
}
