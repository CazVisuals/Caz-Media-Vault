"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function Player({ id }: { id: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const restore = () => { const saved = Number(localStorage.getItem(`cmv-progress:${id}`)) || 0; if (saved > 10 && saved < video.duration - 20) video.currentTime = saved; };
    const save = () => { if (video.currentTime > 0) localStorage.setItem(`cmv-progress:${id}`, String(video.currentTime)); };
    video.addEventListener("loadedmetadata", restore);
    video.addEventListener("timeupdate", save);
    video.focus();
    return () => { save(); video.removeEventListener("loadedmetadata", restore); video.removeEventListener("timeupdate", save); };
  }, [id]);

  return <main className="player-shell">
    <Link href={`/tv/movie/${id}`} className="player-back">← Back</Link>
    <video ref={videoRef} src={`/api/media/stream/${id}`} controls autoPlay playsInline preload="metadata" />
  </main>;
}
