"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Movie } from "@/lib/media/types";
import type { MediaProbe } from "@/lib/media/probe";

type Inspection = { movie: Movie; probe?: MediaProbe; error?: string };
type PcWorkerStatus = { status?: string; reason?: string; source?: string; output?: string; mode?: string; updatedAt?: string; computer?: string; override?: boolean; jobId?: string; error?: string; workerVersion?: string; progress?: number; durationSeconds?: number; };
type PcJob = { id: string; source: string; output?: string; mode?: string; status: "converting" | "copying" | "completed" | "failed"; error?: string; startedAt?: string; updatedAt?: string; completedAt?: string; };
type MaintenanceReport = { status?: string; startedAt?: string; completedAt?: string; scanned?: number; mobileReady?: number; incompatible?: number; probeErrors?: number; exactDuplicatesRemoved?: number; duplicatePolicy?: string; incompatibleFiles?: { path: string; size?: number }[]; };
type PcWorker = { success: boolean; enabled?: boolean; status?: PcWorkerStatus | null; history?: PcJob[]; maintenance?: MaintenanceReport | null; error?: string };

function normalized(value: string) { return value.replace(/\//g, "\\").toLowerCase(); }
function sourceMatches(relativePath: string, source: string) { return normalized(source).endsWith(normalized(relativePath)); }
function sameSource(left: string, right: string) { return normalized(left) === normalized(right) || normalized(left).endsWith(normalized(right)) || normalized(right).endsWith(normalized(left)); }
function displaySource(source: string) { const marker = "\\video\\"; const lower = source.toLowerCase(); const index = lower.indexOf(marker); return index >= 0 ? source.slice(index + marker.length) : source.split("\\").pop() || source; }
function modeLabel(mode?: string) { return mode === "remux" ? "Quick remux" : mode === "audio" || mode === "audio-convert" ? "Audio conversion" : mode === "transcode" ? "RTX NVENC" : "Conversion"; }

export default function MediaToolsPage() {
  const [items, setItems] = useState<Inspection[]>([]);
  const [scanTotal, setScanTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pcWorker, setPcWorker] = useState<PcWorker | null>(null);
  const [pcOnline, setPcOnline] = useState(false);
  const [pcBusy, setPcBusy] = useState(false);
  const [pcMessage, setPcMessage] = useState("");
  const [libraryRefreshing, setLibraryRefreshing] = useState(false);
  const libraryRefreshInFlight = useRef(false);

  async function refreshLibrary() {
    if (libraryRefreshInFlight.current) return;
    libraryRefreshInFlight.current = true;
    setLibraryRefreshing(true);
    try {
      const response = await fetch("/api/media/library", { cache: "no-store" });
      const result = await response.json() as { movies?: Movie[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Library unavailable.");
      const movies = result.movies || [];
      const inspections: Inspection[] = new Array(movies.length);
      setScanTotal(movies.length);
      setItems([]);
      let nextIndex = 0;
      const inspectNext = async () => {
        for (;;) {
          const index = nextIndex++;
          if (index >= movies.length) return;
          const movie = movies[index];
          try {
            const probeResponse = await fetch(`/api/media/inspect?path=${encodeURIComponent(movie.relativePath)}`, { cache: "no-store" });
            const probeResult = await probeResponse.json() as { probe?: MediaProbe; error?: string };
            inspections[index] = probeResponse.ok && probeResult.probe ? { movie, probe: probeResult.probe } : { movie, error: probeResult.error || "Inspection failed." };
          } catch { inspections[index] = { movie, error: "Inspection failed." }; }
          setItems(inspections.filter((item): item is Inspection => Boolean(item)));
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, movies.length) }, () => inspectNext()));
    } finally {
      libraryRefreshInFlight.current = false;
      setLibraryRefreshing(false);
    }
  }

  async function refreshPc(details = false) {
    const response = await fetch(`/api/admin/pc-worker?details=${details ? "1" : "0"}&offset=0&limit=50`, { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as PcWorker;
    setPcWorker((current) => details || !current ? result : {
      ...current,
      ...result,
      history: current.history,
      maintenance: current.maintenance ? { ...current.maintenance, ...result.maintenance } : result.maintenance,
    });
    const updatedAt = result.status?.updatedAt ? new Date(result.status.updatedAt).getTime() : 0;
    setPcOnline(Boolean(updatedAt && Date.now() - updatedAt < 90000));
  }

  async function loadMoreQueue() {
    const offset = pcWorker?.maintenance?.incompatibleFiles?.length || 0;
    setPcBusy(true);
    try {
      const response = await fetch(`/api/admin/pc-worker?details=1&offset=${offset}&limit=50`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load more queue entries.");
      const result = await response.json() as PcWorker;
      setPcWorker((current) => current ? {
        ...current,
        status: result.status || current.status,
        history: [...(current.history || []), ...(result.history || [])].filter((job, index, all) => all.findIndex((item) => item.id === job.id) === index),
        maintenance: current.maintenance ? {
          ...current.maintenance,
          ...result.maintenance,
          incompatibleFiles: [...(current.maintenance.incompatibleFiles || []), ...(result.maintenance?.incompatibleFiles || [])],
        } : result.maintenance,
      } : result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load more queue entries."); }
    finally { setPcBusy(false); }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try { await refreshPc(true); }
      catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Media inspection failed."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    const pcInterval = window.setInterval(() => { if (active) void refreshPc(false); }, 30000);
    return () => { active = false; window.clearInterval(pcInterval); };
  }, []);

  async function pcCommand(action: "enable" | "run-now" | "pause" | "resume" | "stop" | "end-override" | "run-maintenance" | "clear-completed" | "clear-failed") {
    setPcBusy(true); setPcMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/pc-worker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json() as PcWorker;
      if (!response.ok || !result.success) throw new Error(result.error || "PC worker command failed.");
      setPcWorker(result);
      const updatedAt = result.status?.updatedAt ? new Date(result.status.updatedAt).getTime() : 0;
      setPcOnline(Boolean(updatedAt && Date.now() - updatedAt < 90000));
      setPcMessage(
        action === "run-now" ? "Daytime Convert Now enabled." :
        action === "end-override" ? "Daytime override will end after the current file; overnight automation stays enabled." :
        action === "run-maintenance" ? "Weekly-style maintenance sweep sent to CAZ-PC." :
        action === "pause" ? "Worker paused." :
        action === "resume" ? "Worker resumed with daytime override." :
        action === "clear-completed" ? "Completed history cleared." :
        action === "clear-failed" ? "Failed history cleared." : "PC worker enabled.",
      );
      window.setTimeout(() => void refreshPc(), 1200);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "PC worker command failed."); }
    finally { setPcBusy(false); }
  }

  const pc = pcWorker?.status;
  const maintenance = pcWorker?.maintenance;
  const history = pcWorker?.history || [];
  const completedHistory = history.filter((job) => job.status === "completed");
  const historyFailures = history.filter((job) => job.status === "failed" && !completedHistory.some((completed) => sameSource(completed.source, job.source)));
  const liveFailedJob: PcJob | null = pc?.status === "failed" && pc.source && !completedHistory.some((completed) => sameSource(completed.source, pc.source!)) ? { id: pc.jobId || `live-failed-${pc.source}`, source: pc.source, output: pc.output, mode: pc.mode, status: "failed", error: pc.error || pc.reason || "CAZ-PC reported a conversion failure.", updatedAt: pc.updatedAt } : null;
  const failedHistory = liveFailedJob && !historyFailures.some((job) => job.id === liveFailedJob.id || sameSource(job.source, liveFailedJob.source)) ? [liveFailedJob, ...historyFailures] : historyFailures;
  const rawPending = items.filter((item) => item.probe && !item.probe.mobileCompatible);
  const pending = rawPending.filter((item) => !completedHistory.some((job) => sourceMatches(item.movie.relativePath, job.source)));
  const reportedPending = (maintenance?.incompatibleFiles || []).filter((file) => !completedHistory.some((job) => sameSource(file.path, job.source)));
  const maintenanceFinishedAt = maintenance?.completedAt ? Date.parse(maintenance.completedAt) : 0;
  const completedSinceMaintenance = completedHistory.filter((job) => maintenanceFinishedAt && Date.parse(job.completedAt || job.updatedAt || "") > maintenanceFinishedAt);
  const inspectedTotal = items.filter((item) => item.probe).length;
  const usingFreshInspection = inspectedTotal > 0;
  const total = usingFreshInspection ? inspectedTotal : maintenance?.scanned ?? 0;
  const remaining = usingFreshInspection ? pending.length : Math.max(0, (maintenance?.incompatible ?? reportedPending.length) - completedSinceMaintenance.length);
  const ready = usingFreshInspection ? Math.max(0, total - pending.length) : Math.max(0, total - remaining - (maintenance?.probeErrors ?? 0));
  const readyPercent = total ? Math.round((ready / total) * 100) : 0;
  const currentSource = pc?.source || "";
  const currentFile = currentSource.split("\\").pop() || "";
  const workerLabel = !pcOnline ? "Offline" : pc?.status === "converting" ? "Converting" : pc?.status === "copying" ? "Copying to NAS" : pc?.status === "maintenance" ? "Weekly maintenance" : pc?.status === "failed" ? "Failed" : pc?.status === "paused" ? "Paused" : pc?.status === "waiting" ? "Connected / waiting" : pc?.status || "Connected";

  return <main className="admin-shell">
    <header className="admin-header">
      <div><Link href="/settings">← System Status</Link><p className="eyebrow">MEDIA HEALTH</p><h1>Compatibility & Conversion</h1></div>
      <div className="conversion-controls">
        {pc?.override ? <button className="secondary-button" disabled={pcBusy || !pcWorker?.enabled} onClick={() => void pcCommand("end-override")}>End daytime override</button> : null}
        <button className="secondary-button" disabled={pcBusy || !pcWorker?.enabled} onClick={() => void pcCommand("pause")}>Ⅱ Pause worker</button>
        <button className="secondary-button" disabled={pcBusy || !pcWorker?.enabled} onClick={() => void pcCommand("resume")}>▶ Resume</button>
        <button className="primary-button" disabled={pcBusy || !pcWorker?.enabled || !pcOnline} onClick={() => void pcCommand("run-now")}>{pcBusy ? "Sending…" : `Convert now (${remaining})`}</button>
      </div>
    </header>

    <section className="admin-panel">
      <div className="queue-heading"><div><p className="eyebrow">CAZ-PC CONVERSION WORKER</p><h2>{workerLabel}</h2></div><span className={pcOnline ? "status-good" : "status-neutral"}>{pcOnline ? pc?.computer || "PC connected" : "Waiting for PC"}</span></div>
      <div className="queue-overall"><span style={{ width: `${readyPercent}%` }} /></div>
      <p><strong>{ready} of {total}</strong> files are confirmed mobile ready · <strong>{remaining}</strong> remaining.{libraryRefreshing && scanTotal ? ` ${items.length} of ${scanTotal} inspected safely.` : usingFreshInspection ? " Fresh compatibility scan loaded." : maintenance ? " Using the latest completed maintenance report." : " Run a compatibility scan when you need fresh file details."}</p>
      <p>{pcOnline ? pc?.status === "failed" ? (pc.error || pc.reason || "The current conversion failed.") : pc?.reason ? `${pc.reason}.` : pc?.override ? "Daytime Convert Now override is active." : "Normal overnight rules are active." : "The site has not received a fresh heartbeat from the Windows worker."}</p>
      {currentFile ? <><p><strong>Current file:</strong> {currentFile} · {modeLabel(pc?.mode)}{pc?.status === "converting" && typeof pc.progress === "number" ? ` · ${pc.progress}%` : ""}</p>{pc?.status === "converting" ? <div className="job-progress"><span style={{ width: `${pc.progress || 0}%` }} /></div> : null}</> : null}
      {pc?.updatedAt ? <small>Last heartbeat: {new Date(pc.updatedAt).toLocaleTimeString()}{pc.workerVersion ? ` · Worker ${pc.workerVersion}` : ""}</small> : null}
      <div className="hero-actions"><button className="secondary-button" disabled={libraryRefreshing} onClick={() => void refreshLibrary().catch(() => undefined)}>{libraryRefreshing ? "Scanning…" : "Refresh compatibility scan"}</button>{!pcWorker?.enabled ? <button className="secondary-button" disabled={pcBusy} onClick={() => void pcCommand("enable")}>Enable PC Worker</button> : null}</div>
      {pcMessage ? <p className="artwork-ready">{pcMessage}</p> : null}
    </section>

    <section className="admin-panel">
      <div className="queue-heading"><div><p className="eyebrow">WEEKLY MAINTENANCE</p><h2>Compatibility + duplicate cleanup</h2></div><button className="secondary-button" disabled={pcBusy || !pcOnline || pc?.status === "converting" || pc?.status === "copying"} onClick={() => void pcCommand("run-maintenance")}>Run maintenance now</button></div>
      <p>CAZ-PC automatically runs this Sunday around 4 AM when the overnight queue is idle. Exact duplicates are only acted on after matching file size and SHA-256 hash.</p>
      {maintenance ? <><p><strong>{maintenance.scanned ?? 0}</strong> scanned · <strong>{maintenance.mobileReady ?? 0}</strong> mobile ready · <strong>{maintenance.incompatible ?? 0}</strong> incompatible · <strong>{maintenance.exactDuplicatesRemoved ?? 0}</strong> exact duplicates removed from the active library · <strong>{maintenance.probeErrors ?? 0}</strong> probe errors.</p>{maintenance.completedAt ? <small>Last maintenance: {new Date(maintenance.completedAt).toLocaleString()}</small> : null}<p><small>{maintenance.duplicatePolicy}</small></p></> : <p>No weekly maintenance report yet.</p>}
    </section>

    {error ? <div className="state-card error">{error}</div> : null}{loading ? <div className="state-card">Inspecting your library…</div> : null}

    {!loading ? <section className="admin-panel"><div className="queue-heading"><div><p className="eyebrow">CAZ-PC QUEUE</p><h2>{remaining ? `${remaining} waiting for conversion` : total ? "All reported media is ready" : "Run a compatibility scan for file details"}</h2></div><div className="queue-actions"><button className="secondary-button" disabled={pcBusy || completedHistory.length === 0} onClick={() => void pcCommand("clear-completed")}>Clear completed</button><button className="secondary-button" disabled={pcBusy || failedHistory.length === 0} onClick={() => void pcCommand("clear-failed")}>Clear failed</button></div></div>
      {pending.map(({ movie, probe }) => { const isCurrent = Boolean(currentSource && sourceMatches(movie.relativePath, currentSource)); const isFailed = isCurrent && pc?.status === "failed"; const label = isFailed ? "Failed" : isCurrent && pc?.status === "copying" ? "Copying to NAS" : isCurrent ? `Converting${typeof pc?.progress === "number" ? ` · ${pc.progress}%` : ""}` : "Queued"; const statusClass = isFailed ? "queue-failed" : isCurrent ? "queue-converting" : "queue-queued"; return <div className="queue-row" key={movie.id}><div><strong>{movie.relativePath}</strong><small>{isFailed ? (pc?.error || pc?.reason || modeLabel(probe?.conversionMode || undefined)) : modeLabel(probe?.conversionMode || undefined)}</small></div><span className={statusClass}>{label}</span><div className="job-progress"><span style={{ width: `${isCurrent && pc?.status === "converting" ? pc.progress || 0 : 0}%` }} /></div></div>; })}
      {!usingFreshInspection ? reportedPending.map((file) => { const isCurrent = Boolean(currentSource && sameSource(file.path, currentSource)); const isFailed = isCurrent && pc?.status === "failed"; const label = isFailed ? "Failed" : isCurrent && pc?.status === "copying" ? "Copying to NAS" : isCurrent ? `Converting${typeof pc?.progress === "number" ? ` · ${pc.progress}%` : ""}` : "Waiting"; return <div className="queue-row" key={file.path}><div><strong>{displaySource(file.path)}</strong><small>{isFailed ? pc?.error || pc?.reason || "Conversion failed" : isCurrent ? modeLabel(pc?.mode) : "Needs conversion"}</small></div><span className={isFailed ? "queue-failed" : isCurrent ? "queue-converting" : "queue-queued"}>{label}</span><div className="job-progress"><span style={{ width: `${isCurrent && pc?.status === "converting" ? pc.progress || 0 : 0}%` }} /></div></div>; }) : null}
      {!usingFreshInspection && (maintenance?.incompatible ?? 0) > (maintenance?.incompatibleFiles?.length ?? 0) ? <button className="secondary-button" disabled={pcBusy} onClick={() => void loadMoreQueue()}>Show 50 more ({(maintenance?.incompatible ?? 0) - (maintenance?.incompatibleFiles?.length ?? 0)} remaining)</button> : null}
      {completedHistory.map((job) => <div className="queue-row" key={job.id}><div><strong>{displaySource(job.source)}</strong><small>{modeLabel(job.mode)}</small></div><span className="queue-completed">Completed</span><div className="job-progress"><span style={{ width: "100%" }} /></div></div>)}
      {failedHistory.filter((job) => !pending.some((item) => sourceMatches(item.movie.relativePath, job.source))).map((job) => <div className="queue-row" key={job.id}><div><strong>{displaySource(job.source)}</strong><small>{job.error || modeLabel(job.mode)}</small></div><span className="queue-failed">Failed</span><div className="job-progress"><span style={{ width: "0%" }} /></div></div>)}
      {!pending.length && !reportedPending.length && !completedHistory.length && !failedHistory.length ? <div className="state-card"><strong>Queue complete</strong><small>CAZ-PC has no incompatible files waiting in the last scan.</small></div> : null}</section> : null}

    <p className="overview">CAZ-PC is the only conversion and maintenance engine. Worker history updates the queue without repeatedly FFprobing the NAS. Weekly maintenance performs the expensive full verification and exact-duplicate cleanup.</p>
    <section className="organizer-list">{items.map(({ movie, probe, error: inspectError }) => <article className="media-health-card" key={movie.id}><div><h2>{movie.title}</h2><p>{movie.fileName}</p></div>{probe ? <><div className="codec-list"><span>{probe.container}</span><span>Video: {probe.videoCodec || "unknown"}</span><span>Audio: {probe.audioCodec || "none"}</span>{probe.width ? <span>{probe.width}×{probe.height}</span> : null}</div><strong className={probe.mobileCompatible ? "status-good" : "status-neutral"}>{probe.mobileCompatible ? "Mobile ready" : probe.conversionMode === "remux" ? "Quick remux" : probe.conversionMode === "audio-convert" ? "Fast audio fix" : "Full conversion"}</strong></> : <span className="state-card error">{inspectError}</span>}</article>)}</section>
  </main>;
}
