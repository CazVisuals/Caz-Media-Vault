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
    const restore = () => { const saved = Number(localStorage.getItem(`constants-hub-progress:${id}`) || localStorage.getItem(`cmv-progress:${id}`)) || 0; if (saved > 10 && saved < video.duration - 20) video.currentTime = saved; };
    const save = () => { if (video.currentTime > 0) localStorage.setItem(`constants-hub-progress:${id}`, String(video.currentTime)); };
    video.addEventListener("loadedmetadata", restore);
    video.addEventListener("timeupdate", save);
    video.focus();
    return () => { save(); video.removeEventListener("loadedmetadata", restore); video.removeEventListener("timeupdate", save); };
  }, [id]);

  const warning = movie ? compatibility(movie.fileName) : null;
  return <main className="player-shell">
    <Link href={`/tv/movie/${id}`} className="player-back">← Back</Link>
    <video ref={videoRef} src={`/api/media/stream/${id}`} controls autoPlay playsInline preload="metadata" onError={() => setPlaybackError("This video format or audio codec is not supported by this device.")} />
    {warning || playbackError ? <aside className="player-notice" role="alert"><strong>{playbackError ? "Playback unavailable" : "Mobile compatibility"}</strong><p>{playbackError || warning}</p><small>Original file: {movie?.fileName || "Loading…"}</small></aside> : null}
  </main>;
}
