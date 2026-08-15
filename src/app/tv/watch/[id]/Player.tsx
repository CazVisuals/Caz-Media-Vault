"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Movie } from "@/lib/media/types";

function compatibility(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "mp4" || extension === "m4v") return null;
  return `.${extension || "unknown"} files may not play in mobile Safari. For reliable mobile playback, use MP4 with H.264 video and AAC audio.`;
}

export default function Player({ id }: { id: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [playbackError, setPlaybackError] = useState("");

  useEffect(() => {
    fetch(`/api/media/library/${id}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { movie?: Movie };
        if (response.ok && result.movie) setMovie(result.movie);
      })
      .catch(() => undefined);
  }, [id]);

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
    const onTimeUpdate = () => save(false);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.focus();
    return () => { save(true); video.removeEventListener("loadedmetadata", restore); video.removeEventListener("timeupdate", onTimeUpdate); };
  }, [id]);

  const warning = movie ? compatibility(movie.fileName) : null;
  return <main className="player-shell">
    <Link href={`/tv/movie/${id}`} className="player-back">← Back</Link>
    <video ref={videoRef} src={`/api/media/stream/${id}`} controls autoPlay playsInline preload="metadata" onError={() => setPlaybackError("This video format or audio codec is not supported by this device.")} />
    {warning || playbackError ? <aside className="player-notice" role="alert"><strong>{playbackError ? "Playback unavailable" : "Mobile compatibility"}</strong><p>{playbackError || warning}</p><small>Original file: {movie?.fileName || "Loading…"}</small></aside> : null}
  </main>;
}
