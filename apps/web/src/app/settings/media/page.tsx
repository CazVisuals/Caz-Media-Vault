"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Movie } from "@/lib/media/types";
import type { MediaProbe } from "@/lib/media/probe";
import type { ConversionJob } from "@/lib/media/conversion";

type Inspection = { movie: Movie; probe?: MediaProbe; error?: string };

export default function MediaToolsPage() {
  const [items, setItems] = useState<Inspection[]>([]);
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [error, setError] = useState("");

  async function refreshJobs() {
    const response = await fetch("/api/media/conversions", { cache: "no-store" });
    const result = await response.json() as { jobs?: ConversionJob[] };
    if (response.ok) setJobs(result.jobs || []);
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
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Media inspection failed."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    const interval = window.setInterval(() => void refreshJobs(), 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  async function queueAll() {
    setQueueing(true); setError("");
    try {
      const response = await fetch("/api/media/conversions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan: true }) });
      const result = await response.json() as { jobs?: ConversionJob[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not queue conversions.");
      setJobs(result.jobs || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not queue conversions."); }
    finally { setQueueing(false); }
  }

  const incompatible = items.filter((item) => item.probe && !item.probe.mobileCompatible).length;
  return <main className="admin-shell">
    <header className="admin-header"><div><Link href="/settings">← System Status</Link><p className="eyebrow">MEDIA HEALTH</p><h1>Compatibility & Conversion</h1></div><button className="primary-button" disabled={queueing || loading} onClick={() => void queueAll()}>{queueing ? "Scanning…" : `Convert incompatible (${incompatible})`}</button></header>
    <p className="overview">FFprobe checks the real container and codecs. Conversion runs one movie at a time as H.264/AAC MP4. Originals are archived, never deleted.</p>
    {error ? <div className="state-card error">{error}</div> : null}{loading ? <div className="state-card">Inspecting your library…</div> : null}
    {jobs.length ? <section className="admin-panel"><p className="eyebrow">CONVERSION QUEUE</p>{jobs.map((job) => <div className="queue-row" key={job.id}><strong>{job.source}</strong><span className={`queue-${job.status}`}>{job.status}</span>{job.error ? <small>{job.error}</small> : null}</div>)}</section> : null}
    <section className="organizer-list">{items.map(({ movie, probe, error: inspectError }) => <article className="media-health-card" key={movie.id}><div><h2>{movie.title}</h2><p>{movie.fileName}</p></div>{probe ? <><div className="codec-list"><span>{probe.container}</span><span>Video: {probe.videoCodec || "unknown"}</span><span>Audio: {probe.audioCodec || "none"}</span>{probe.width ? <span>{probe.width}×{probe.height}</span> : null}</div><strong className={probe.mobileCompatible ? "status-good" : "status-neutral"}>{probe.mobileCompatible ? "Mobile ready" : "Conversion needed"}</strong></> : <span className="state-card error">{inspectError}</span>}</article>)}</section>
  </main>;
}
