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
  const lastSavedRef = useRef(0);
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
    const key = `constants-hub-progress:${id}`;
    const legacyKey = `cmv-progress:${id}`;

    const restore = () => {
      const saved = Number(localStorage.getItem(key) || localStorage.getItem(legacyKey)) || 0;
      if (saved > 10 && Number.isFinite(video.duration) && saved < video.duration - 20) video.currentTime = saved;
    };

    const save = (force = false) => {
      if (!Number.isFinite(video.currentTime) || video.currentTime <= 0) return;
      if (!force && Math.abs(video.currentTime - lastSavedRef.current) < 5) return;
      if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime >= video.duration - 30) {
        localStorage.removeItem(key);
        localStorage.removeItem(legacyKey);
      } else {
        localStorage.setItem(key, String(video.currentTime));
        localStorage.removeItem(legacyKey);
      }
      lastSavedRef.current = video.currentTime;
    };

    const finish = () => {
      localStorage.removeItem(key);
      localStorage.removeItem(legacyKey);
    };

    const leaving = () => save(true);
    video.addEventListener("loadedmetadata", restore);
    video.addEventListener("timeupdate", save);
    video.addEventListener("pause", leaving);
    video.addEventListener("ended", finish);
    window.addEventListener("pagehide", leaving);
    video.focus();

    return () => {
      save(true);
      video.removeEventListener("loadedmetadata", restore);
      video.removeEventListener("timeupdate", save);
      video.removeEventListener("pause", leaving);
      video.removeEventListener("ended", finish);
      window.removeEventListener("pagehide", leaving);
    };
  }, [id]);

  const warning = movie ? compatibility(movie.fileName) : null;
  return <main className="player-shell">
    <Link href={`/tv/movie/${id}`} className="player-back">← Back</Link>
    <video ref={videoRef} src={`/api/media/stream/${id}`} controls autoPlay playsInline preload="metadata" onError={() => setPlaybackError("This video format or audio codec is not supported by this device.")} />
    {warning || playbackError ? <aside className="player-notice" role="alert"><strong>{playbackError ? "Playback unavailable" : "Mobile compatibility"}</strong><p>{playbackError || warning}</p><small>Original file: {movie?.fileName || "Loading…"}</small></aside> : null}
  </main>;
}
