"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { episodeCode, parseEpisodeName } from "@/lib/media/episodes";

type Item = { name: string; type: "file" | "folder"; relativePath: string };
type Preview = { source: string; fileName: string; title: string; year: string | null; destination: string; genre: string; posterUrl: string | null; isKids: boolean; isEpisode: boolean; ready: boolean };
const VIDEO = [".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"];

function parse(fileName: string) {
  const extension = fileName.match(/\.[^/.]+$/)?.[0] || "";
  const stem = fileName.slice(0, extension ? -extension.length : undefined);
  const year = stem.match(/\((19|20)\d{2}\)/)?.[0].slice(1, -1) || null;
  const title = stem.replace(/\((19|20)\d{2}\)/, "").replace(/[._]+/g, " ").replace(/\s+/g, " ").trim() || stem;
  return { extension, title, year };
}

function safeName(value: string) { return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim(); }

export default function OrganizePage() {
  const [movies, setMovies] = useState<Preview[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/media/scan", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { success: boolean; items?: Item[]; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "Inbox scan failed.");
      const inbox = (result.items || []).filter((item) => item.type === "file" && item.relativePath.toLowerCase().startsWith("inbox/") && VIDEO.some((extension) => item.name.toLowerCase().endsWith(extension)));
      const previews = inbox.map((item) => {
        const parsed = parse(item.name);
        const episode = parseEpisodeName(item.name);
        return { source: item.relativePath, fileName: item.name, title: episode?.seriesTitle || parsed.title, year: parsed.year, destination: "", genre: "Checking…", posterUrl: null, isKids: false, isEpisode: Boolean(episode), ready: false };
      });
      setMovies(previews);
      await Promise.all(previews.map(async (movie) => {
        let genre = "Other";
        let title = movie.title;
        let year = movie.year;
        let posterUrl: string | null = null;
        let isKids = false;
        try {
          const episode = parseEpisodeName(movie.fileName);
          const params = new URLSearchParams({ title, type: episode ? "tv" : "movie" });
          if (year) params.set("year", year);
          const response = await fetch(`/api/media/metadata?${params}`);
          const result = await response.json() as { movie?: { title: string; year: string | null; genres: string[]; posterUrl: string | null; isKids: boolean } | null };
          if (response.ok && result.movie) { title = result.movie.title; year = result.movie.year || year; isKids = result.movie.isKids; genre = isKids ? "Kids" : result.movie.genres[0] || genre; posterUrl = result.movie.posterUrl; }
        } catch { /* Other is the safe metadata fallback. */ }
        const parsed = parse(movie.fileName);
        const episode = parseEpisodeName(movie.fileName);
        let destination: string;
        if (episode) {
          const series = safeName(title || episode.seriesTitle);
          const season = `Season ${String(episode.seasonNumber).padStart(2, "0")}`;
          destination = `TV Shows/${series}/${season}/${series} - ${episodeCode(episode)}${parsed.extension}`;
          genre = "TV Shows";
        } else {
          const folder = safeName(year ? `${title} (${year})` : title);
          destination = `${safeName(genre)}/${folder}/${folder}${parsed.extension}`;
        }
        setMovies((current) => current.map((item) => item.source === movie.source ? { ...item, title, year, genre, posterUrl, isKids, destination, ready: true } : item));
      }));
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Inbox scan failed.")).finally(() => setLoading(false));
  }, []);

  async function move(movie: Preview) {
    if (!movie.ready) return;
    setMoving(movie.source); setError(""); setMessage("");
    try {
      const response = await fetch("/api/media/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceRelativePath: movie.source, destinationRelativePath: movie.destination, posterUrl: movie.posterUrl }) });
      const result = await response.json() as { success: boolean; message?: string; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "Move failed.");
      setMovies((current) => current.filter((item) => item.source !== movie.source));
      setConfirming(null);
      setMessage(result.message || (movie.isEpisode ? "Episode organized." : "Movie organized."));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Move failed."); }
    finally { setMoving(null); }
  }

  return <main className="admin-shell"><header className="admin-header"><div><Link href="/settings">← System Status</Link><p className="eyebrow">SAFE ORGANIZER</p><h1>Inbox Preview</h1></div><span className="status-neutral">Inbox only</span></header>
    <p className="overview">Movies are organized by genre. Episodes are grouped under TV Shows, series, and season. Every destination is previewed and requires confirmation.</p>
    {message ? <div className="state-card">{message}</div> : null}{error ? <div className="state-card error">{error}</div> : null}{loading ? <div className="state-card">Scanning Inbox…</div> : null}
    {!loading && !error && movies.length === 0 ? <div className="state-card">Inbox has no video files waiting to be organized.</div> : null}
    <section className="organizer-list">{movies.map((movie) => <article className="organizer-card" key={movie.source}>{movie.posterUrl ? <img /* eslint-disable-line @next/next/no-img-element -- remote preview is saved locally during organization */ className="organizer-poster" src={movie.posterUrl} alt={`${movie.title} poster`} /> : <div className="organizer-poster poster-fallback"><span>CH</span></div>}<div><small>INBOX FILE</small><h2>{movie.title}</h2><p>{movie.fileName}</p>{movie.isEpisode ? <small className="artwork-ready">TV EPISODE</small> : null}{movie.isKids ? <small className="kids-ready">KIDS &amp; FAMILY</small> : null}{movie.posterUrl ? <small className="artwork-ready">POSTER READY</small> : null}</div><div className="destination"><small>DESTINATION</small><p>{movie.ready ? movie.destination : "Checking metadata…"}</p></div><div className="organizer-actions">{confirming === movie.source ? <><button className="primary-button" disabled={moving === movie.source} onClick={() => void move(movie)}>{moving === movie.source ? "Moving…" : "Confirm move"}</button><button className="secondary-button" disabled={moving === movie.source} onClick={() => setConfirming(null)}>Cancel</button></> : <button className="primary-button" disabled={!movie.ready || moving !== null} onClick={() => { setError(""); setMessage(""); setConfirming(movie.source); }}>Organize</button>}</div></article>)}</section>
  </main>;
}
