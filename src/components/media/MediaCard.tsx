"use client";

import Link from "next/link";
import type { Movie } from "@/lib/media/types";

export function MediaCard({ movie }: { movie: Movie }) {
  return (
    <article className="media-card group">
      <div className="poster-shell media-poster-shell">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {movie.posterUrl ? <img src={movie.posterUrl} alt="" className="poster" /> : <div className="poster-fallback"><span>CH</span></div>}
        <div className="media-card-shade" />
        {movie.rating !== null ? <span className="rating">★ {movie.rating.toFixed(1)}</span> : null}
        <div className="media-card-actions">
          <Link
            href={`/tv/watch/${movie.id}`}
            aria-label={`Play ${movie.title}`}
            className="focusable media-play-button"
            data-focusable="true"
          >
            <span className="media-action-icon" aria-hidden="true">▶</span>
            <span className="media-action-label">Play</span>
          </Link>
          <Link
            href={`/tv/movie/${movie.id}`}
            aria-label={`Information about ${movie.title}`}
            className="focusable media-info-button"
            data-focusable="true"
          >
            <span className="media-action-icon" aria-hidden="true">ⓘ</span>
            <span className="media-action-label">Info</span>
          </Link>
        </div>
      </div>
      <Link href={`/tv/movie/${movie.id}`} className="focusable block truncate font-semibold text-white" data-focusable="true">{movie.title}</Link>
      <span>{movie.year || "Year unknown"}{movie.genre ? ` · ${movie.genre}` : ""}</span>
    </article>
  );
}
