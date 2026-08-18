"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { episodeCode, parseEpisodeName } from "@/lib/media/episodes";
import styles from "./OrganizePage.module.css";

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
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkMoving, setBulkMoving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

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

  const readyMovies = useMemo(() => movies.filter((movie) => movie.ready), [movies]);
  const selectedMovies = useMemo(() => movies.filter((movie) => selected.includes(movie.source)), [movies, selected]);
  const selectedReady = useMemo(() => selectedMovies.filter((movie) => movie.ready), [selectedMovies]);
  const selectedEpisodes = selectedReady.filter((movie) => movie.isEpisode).length;
  const selectedFilms = selectedReady.length - selectedEpisodes;
  const allReadySelected = readyMovies.length > 0 && readyMovies.every((movie) => selected.includes(movie.source));

  function toggle(movie: Preview) {
    setBulkConfirming(false);
    setSelected((current) => current.includes(movie.source) ? current.filter((source) => source !== movie.source) : [...current, movie.source]);
  }

  function toggleAllReady() {
    setBulkConfirming(false);
    if (allReadySelected) setSelected((current) => current.filter((source) => !readyMovies.some((movie) => movie.source === source)));
    else setSelected((current) => Array.from(new Set([...current, ...readyMovies.map((movie) => movie.source)])));
  }

  async function requestMove(movie: Preview) {
    const response = await fetch("/api/media/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceRelativePath: movie.source, destinationRelativePath: movie.destination, posterUrl: movie.posterUrl }) });
    const result = await response.json() as { success: boolean; message?: string; error?: string };
    if (!response.ok || !result.success) throw new Error(result.error || "Move failed.");
    return result.message || (movie.isEpisode ? "Episode organized." : "Movie organized.");
  }

  async function move(movie: Preview) {
    if (!movie.ready) return;
    setMoving(movie.source); setError(""); setMessage("");
    try {
      const resultMessage = await requestMove(movie);
      setMovies((current) => current.filter((item) => item.source !== movie.source));
      setSelected((current) => current.filter((source) => source !== movie.source));
      setConfirming(null);
      setMessage(resultMessage);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Move failed."); }
    finally { setMoving(null); }
  }

  async function organizeSelected() {
    const batch = selectedReady;
    if (!batch.length || bulkMoving) return;
    setBulkMoving(true); setBulkConfirming(false); setError(""); setMessage(""); setBulkProgress({ current: 0, total: batch.length });
    const failed: { source: string; error: string }[] = [];
    let completed = 0;
    for (const movie of batch) {
      setMoving(movie.source);
      setBulkProgress({ current: completed + 1, total: batch.length });
      try {
        await requestMove(movie);
        completed += 1;
        setMovies((current) => current.filter((item) => item.source !== movie.source));
        setSelected((current) => current.filter((source) => source !== movie.source));
      } catch (reason) {
        failed.push({ source: movie.source, error: reason instanceof Error ? reason.message : "Move failed." });
      }
    }
    setMoving(null); setBulkMoving(false); setBulkProgress(null);
    setMessage(`${completed} ${completed === 1 ? "item" : "items"} organized successfully.${failed.length ? ` ${failed.length} need review.` : ""}`);
    if (failed.length) setError(failed.slice(0, 3).map((item) => item.error).join(" · "));
  }

  return <main className="admin-shell"><header className="admin-header"><div><Link href="/settings">← System Status</Link><p className="eyebrow">SAFE ORGANIZER</p><h1>Inbox Preview</h1></div><span className="status-neutral">Inbox only</span></header>
    <p className="overview">Movies are organized by genre. Episodes are grouped under TV Shows, series, and season. Every destination is previewed before anything moves.</p>
    <div className={styles.automationCard}><span className={styles.automationIcon}>✦</span><div><strong>Auto-configuration stays on</strong><span>Every Inbox file still gets its own title, poster, genre or TV season, and safe destination automatically. Multi-select only changes how many ready items you approve at once.</span></div></div>
    {message ? <div className="state-card">{message}</div> : null}{error ? <div className="state-card error">{error}</div> : null}{loading ? <div className="state-card">Scanning Inbox and auto-configuring destinations…</div> : null}
    {!loading && !error && movies.length === 0 ? <div className="state-card">Inbox has no video files waiting to be organized.</div> : null}
    {movies.length ? <><div className={styles.bulkBar}><div className={styles.bulkSummary}><strong>{selected.length ? `${selected.length} selected` : `${movies.length} Inbox items`}</strong><span>{readyMovies.length} ready · {movies.length - readyMovies.length} still processing{bulkProgress ? <> · <b className={styles.progressText}>Organizing {bulkProgress.current} of {bulkProgress.total}</b></> : null}</span></div><div className={styles.bulkActions}><button type="button" className={styles.bulkButton} disabled={bulkMoving || readyMovies.length === 0} onClick={toggleAllReady}>{allReadySelected ? "Clear ready" : "Select all ready"}</button>{selected.length ? <button type="button" className={styles.bulkButton} disabled={bulkMoving} onClick={() => { setSelected([]); setBulkConfirming(false); }}>Clear selection</button> : null}<button type="button" className={styles.bulkPrimary} disabled={bulkMoving || selectedReady.length === 0} onClick={() => { if (bulkConfirming) void organizeSelected(); else setBulkConfirming(true); }}>{bulkMoving ? "Organizing…" : bulkConfirming ? `Confirm ${selectedReady.length}` : `Organize selected${selectedReady.length ? ` (${selectedReady.length})` : ""}`}</button></div></div>{bulkConfirming ? <div className={styles.confirmCard}><strong>Confirm bulk organization</strong><span>{selectedReady.length} ready items will use their already-previewed destinations: {selectedFilms} {selectedFilms === 1 ? "movie" : "movies"} and {selectedEpisodes} {selectedEpisodes === 1 ? "episode" : "episodes"}. Items still checking metadata will not move.</span></div> : null}</> : null}
    <section className="organizer-list">{movies.map((movie) => <article className={`organizer-card ${styles.withSelection}${selected.includes(movie.source) ? ` ${styles.cardSelected}` : ""}`} key={movie.source}><label className={styles.checkWrap} title={movie.ready ? `Select ${movie.title}` : `${movie.title} is still being configured`}><input className={styles.checkbox} type="checkbox" checked={selected.includes(movie.source)} disabled={bulkMoving || !movie.ready} onChange={() => toggle(movie)} aria-label={`Select ${movie.title}`} /></label>{movie.posterUrl ? <img /* eslint-disable-line @next/next/no-img-element -- remote preview is saved locally during organization */ className="organizer-poster" src={movie.posterUrl} alt={`${movie.title} poster`} /> : <div className="organizer-poster poster-fallback"><span>CH</span></div>}<div><small>INBOX FILE</small><h2>{movie.title}</h2><p>{movie.fileName}</p>{movie.isEpisode ? <small className="artwork-ready">TV EPISODE</small> : null}{movie.isKids ? <small className="kids-ready">KIDS &amp; FAMILY</small> : null}{movie.posterUrl ? <small className="artwork-ready">POSTER READY</small> : null}</div><div className="destination"><small>DESTINATION</small><p>{movie.ready ? movie.destination : "Checking metadata…"}</p></div><div className="organizer-actions">{confirming === movie.source ? <><button className="primary-button" disabled={moving === movie.source || bulkMoving} onClick={() => void move(movie)}>{moving === movie.source ? "Moving…" : "Confirm move"}</button><button className="secondary-button" disabled={moving === movie.source || bulkMoving} onClick={() => setConfirming(null)}>Cancel</button></> : <button className="primary-button" disabled={!movie.ready || moving !== null || bulkMoving} onClick={() => { setError(""); setMessage(""); setConfirming(movie.source); }}>Organize</button>}</div></article>)}</section>
  </main>;
}
