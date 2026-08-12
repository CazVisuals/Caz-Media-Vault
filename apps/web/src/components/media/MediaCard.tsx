"use client";

import Link from "next/link";
import type { Movie } from "@/lib/media/types";

export function MediaCard({ movie }: { movie: Movie }) {
  return (
    <Link className="media-card focusable" href={`/tv/movie/${movie.id}`} data-focusable="true">
      <div className="poster-shell">
        {/* Native images keep local NAS artwork compatible with older TV browsers. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {movie.posterUrl ? <img src={movie.posterUrl} alt="" className="poster" /> : <div className="poster-fallback"><span>CMV</span></div>}
        {movie.rating !== null ? <span className="rating">★ {movie.rating.toFixed(1)}</span> : null}
      </div>
      <strong>{movie.title}</strong>
      <span>{movie.year || "Year unknown"}{movie.genre ? ` · ${movie.genre}` : ""}</span>
    </Link>
  );
}
