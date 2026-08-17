"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Movie } from "@/lib/media/types";
import { OfflineDownloadButton } from "@/components/media/OfflineDownloadButton";
import { getOfflineDownload, type OfflineDownload } from "@/lib/offline/client";

function compatibility(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "mp4" || extension === "m4v") return null;
  return `.${extension || "unknown"} files may not play in mobile Safari. For reliable mobile playback, use MP4 with H.264 video and AAC audio.`;
}

export default function Player({ id }: { id: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [playbackError, setPlaybackError] = useState("");
  const [episodes, setEpisodes] = useState<Movie[]>([]);
  const [showUpNext, setShowUpNext] = useState(false);
  const [castAvailable, setCastAvailable] = useState(false);
  const [offlineDownload, setOfflineDownload] = useState<OfflineDownload | null>(null);
  const [sourceReady, setSourceReady] = useState(false);
  const [autoSkip, setAutoSkip] = useState(false);
  const [showSkipRecap, setShowSkipRecap] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const autoSkipApplied = useRef(false);
  useEffect(() => { const video = videoRef.current as (HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void; remote?: { prompt: () => Promise<void> } }) | null; setCastAvailable(Boolean(video?.webkitShowPlaybackTargetPicker || video?.remote?.prompt)); }, [sourceReady]);

  useEffect(() => {
    void getOfflineDownload(id).then((download) => { setOfflineDownload(download?.status === "ready" ? download : null); setSourceReady(true); }).catch(() => setSourceReady(true));
    fetch(`/api/media/library/${id}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { movie?: Movie };
        if (response.ok && result.movie) {
          setMovie(result.movie);
          if (result.movie.mediaType === "tv") void fetch("/api/media/library", { cache: "no-store" }).then((libraryResponse) => libraryResponse.json()).then((library: { movies?: Movie[] }) => setEpisodes((library.movies || []).filter((item) => item.mediaType === "tv" && (item.seriesTitle || item.title).toLowerCase() === (result.movie!.seriesTitle || result.movie!.title).toLowerCase()).sort((a, b) => (a.seasonNumber || 0) - (b.seasonNumber || 0) || (a.episodeNumber || 0) - (b.episodeNumber || 0)))).catch(() => undefined);
        }
      })
      .catch(() => { void getOfflineDownload(id).then((download) => { if (!download) return; setMovie({ id: download.id, title: download.title, year: download.year, fileName: download.fileName, relativePath: "", modifiedAt: download.updatedAt, size: download.size, genre: null, genres: [], isKids: false, mediaType: download.mediaType, seriesTitle: download.seriesTitle, seasonNumber: download.seasonNumber, episodeNumber: download.episodeNumber, overview: null, rating: null, runtimeMinutes: null, tmdbId: null, tagline: null, certification: null, collection: null, posterUrl: null, backdropUrl: null, trailerYouTubeId: null }); }); });
  }, [id]);

  useEffect(() => {
    const initial = window.setTimeout(() => setAutoSkip(localStorage.getItem("constants-hub-auto-skip") === "true"), 0);
    return () => window.clearTimeout(initial);
  }, []);
  useEffect(() => { autoSkipApplied.current = false; }, [id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let remote = 0;
    let lastSync = 0;
    void fetch("/api/user/state", { cache: "no-store" }).then((response) => response.json()).then((state: { progress?: { mediaId: string; seconds: number }[] }) => { remote = state.progress?.find((item) => item.mediaId === id)?.seconds ?? 0; }).catch(() => undefined);
    const restore = () => { const local = Number(localStorage.getItem(`constants-hub-progress:${id}`) || localStorage.getItem(`cmv-progress:${id}`)) || 0; const saved = Math.max(local, remote); if (saved > 10 && saved < video.duration - 20) video.currentTime = saved; };
    const save = (force = false) => {
      if (video.currentTime <= 0) return;
      localStorage.setItem(`constants-hub-progress:${id}`, String(video.currentTime));
      if (force || Date.now() - lastSync > 12_000) { lastSync = Date.now(); void fetch("/api/user/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "progress", mediaId: id, seconds: video.currentTime, duration: video.duration }) }).catch(() => undefined); }
    };
    video.addEventListener("loadedmetadata", restore);
    const onTimeUpdate = () => {
      save(false);
      const isEpisode = movie?.mediaType === "tv";
      setShowSkipRecap(Boolean(isEpisode && video.currentTime >= 3 && video.currentTime < 75));
      setShowSkipIntro(Boolean(isEpisode && video.currentTime >= 75 && video.currentTime < 240));
      if (isEpisode && autoSkip && !autoSkipApplied.current && video.currentTime >= 3 && video.currentTime < 20) {
        autoSkipApplied.current = true;
        video.currentTime = Math.min(150, Math.max(0, video.duration - 5));
      }
      setShowUpNext(Boolean(isEpisode && video.duration > 0 && video.duration - video.currentTime <= 60));
    };
    const onEnded = () => { save(true); const next = episodes[episodes.findIndex((item) => item.id === id) + 1]; if (next) router.replace(`/tv/watch/${next.id}`); };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    video.focus();
    return () => { save(true); video.removeEventListener("loadedmetadata", restore); video.removeEventListener("timeupdate", onTimeUpdate); video.removeEventListener("ended", onEnded); };
  }, [autoSkip, episodes, id, movie?.mediaType, router, sourceReady]);

  const nextEpisode = useMemo(() => episodes[episodes.findIndex((item) => item.id === id) + 1] || null, [episodes, id]);
  async function cast() { const video = videoRef.current as (HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void; remote?: { prompt: () => Promise<void> } }) | null; if (video?.webkitShowPlaybackTargetPicker) video.webkitShowPlaybackTargetPicker(); else await video?.remote?.prompt().catch(() => undefined); }
  function skip(seconds: number) { const video = videoRef.current; if (video) video.currentTime = Math.min(video.duration || Number.POSITIVE_INFINITY, video.currentTime + seconds); }
  function toggleAutoSkip() { setAutoSkip((current) => { const next = !current; localStorage.setItem("constants-hub-auto-skip", String(next)); return next; }); }

  const warning = movie ? compatibility(movie.fileName) : null;
  return <main className="player-shell">
    <Link href={movie?.mediaType === "tv" ? `/tv/show/${id}` : `/tv/movie/${id}`} className="player-back">← Back</Link>
    {castAvailable ? <button className="player-cast secondary-button" onClick={() => void cast()}>▣ Cast</button> : null}
    {movie ? <div className="player-download"><OfflineDownloadButton movie={movie} compact /></div> : null}
    {sourceReady ? <video ref={videoRef} src={offlineDownload ? `/__offline/media/${id}` : `/api/media/stream/${id}`} controls autoPlay playsInline preload="metadata" {...{ "x-webkit-airplay": "allow" }} onError={() => setPlaybackError("This video format or audio codec is not supported by this device.")}>
      <track kind="subtitles" src={`/api/media/subtitles/${id}`} srcLang="en" label="English" />
    </video> : <div className="player-loading">Preparing player…</div>}
    {offlineDownload ? <span className="player-offline-badge">✓ Playing offline copy</span> : null}
    {movie?.mediaType === "tv" ? <div className="skip-controls">
      {showSkipRecap ? <button className="skip-button" onClick={() => skip(60)}>Skip Recap <span>+60s</span></button> : null}
      {showSkipIntro ? <button className="skip-button" onClick={() => skip(90)}>Skip Intro <span>+90s</span></button> : null}
      <button className={`auto-skip-button${autoSkip ? " active" : ""}`} aria-pressed={autoSkip} onClick={toggleAutoSkip}>{autoSkip ? "✓ Auto-skip on" : "Auto-skip off"}</button>
    </div> : null}
    {showUpNext && nextEpisode ? <aside className="up-next"><small>UP NEXT</small><strong>{nextEpisode.title}</strong><div><button className="primary-button" onClick={() => router.replace(`/tv/watch/${nextEpisode.id}`)}>Play now</button><button className="secondary-button" onClick={() => setShowUpNext(false)}>Dismiss</button></div></aside> : null}
    {warning || playbackError ? <aside className="player-notice" role="alert"><strong>{playbackError ? "Playback unavailable" : "Mobile compatibility"}</strong><p>{playbackError || warning}</p><small>Original file: {movie?.fileName || "Loading…"}</small></aside> : null}
  </main>;
}
