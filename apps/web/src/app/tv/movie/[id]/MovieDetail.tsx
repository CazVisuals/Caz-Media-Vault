"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTvNavigation } from "@/components/media/useTvNavigation";
import type { Movie } from "@/lib/media/types";

export default function MovieDetail({ id }: { id: string }) {
  const [movie, setMovie] = useState<Movie | null>(null);
  const [error, setError] = useState("");
  const [resume, setResume] = useState(0);
  useTvNavigation();

  useEffect(() => {
    const resumeTimer = window.setTimeout(() => {
      const current = localStorage.getItem(`constants-hub-progress:${id}`);
      const legacy = localStorage.getItem(`cmv-progress:${id}`);
      setResume(Number(current || legacy) || 0);
    }, 0);
    fetch(`/api/media/library/${id}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { success: boolean; movie?: Movie; error?: string };
        if (!response.ok || !result.movie) throw new Error(result.error || "Movie not found.");
        setMovie(result.movie);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Movie not found."));
    return () => window.clearTimeout(resumeTimer);
  }, [id]);

  if (error) return <main className="detail-shell"><div className="state-card error">{error}</div><Link href="/tv" className="secondary-button focusable" data-focusable="true">Back to movies</Link></main>;
  if (!movie) return <main className="detail-shell"><div className="state-card">Loading movie…</div></main>;

  const background = movie.backdropUrl || movie.posterUrl;
  return <main className="detail-shell" style={background ? { backgroundImage: `linear-gradient(90deg, #05070b 10%, rgba(5,7,11,.88) 52%, rgba(5,7,11,.45)), url(${background})` } : undefined}>
    <Link href="/tv" className="back-link focusable" data-focusable="true">← Browse</Link>
    <section className="detail-content">
      <p className="eyebrow">CONSTANT’S HUB</p><h1>{movie.title}</h1>
      <div className="metadata"><span>{movie.year || "Year unknown"}</span>{movie.runtimeMinutes ? <span>{movie.runtimeMinutes} min</span> : null}{movie.genres.map((genre) => <span key={genre}>{genre}</span>)}{movie.rating !== null ? <span>★ {movie.rating.toFixed(1)}</span> : null}</div>
      <p className="overview">{movie.overview || "Ready to play from your private Synology library."}</p>
      <div className="hero-actions">
        <Link href={`/tv/watch/${movie.id}`} className="primary-button focusable" data-focusable="true">▶ {resume > 30 ? "Resume" : "Play"}</Link>
        {resume > 30 ? <button className="secondary-button focusable" data-focusable="true" onClick={() => { localStorage.removeItem(`constants-hub-progress:${id}`); localStorage.removeItem(`cmv-progress:${id}`); setResume(0); }}>Start over</button> : null}
      </div>
      <small className="file-label">{movie.fileName}</small>
    </section>
  </main>;
}
