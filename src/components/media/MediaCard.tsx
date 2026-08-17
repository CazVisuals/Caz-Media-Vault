"use client";

import Link from "next/link";
import type { Movie } from "@/lib/media/types";

export function MediaCard({ movie }: { movie: Movie }) {
  return (
    <article className="media-card group">
      <div className="poster-shell !border !border-blue-500/15 !bg-[#08101b] transition duration-300 group-hover:!border-blue-400/45 group-hover:!shadow-[0_20px_55px_rgba(14,95,255,.18)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {movie.posterUrl ? <img src={movie.posterUrl} alt="" className="poster" /> : <div className="poster-fallback !bg-[linear-gradient(145deg,#0d2344,#10141d_60%,#05080e)]"><span>CH</span></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/5 transition group-hover:via-black/20" />
        {movie.rating !== null ? <span className="rating">★ {movie.rating.toFixed(1)}</span> : null}
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          <Link
            href={`/tv/watch/${movie.id}`}
            aria-label={`Play ${movie.title}`}
            className="focusable inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-blue-300/40 bg-blue-600/90 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_34px_rgba(37,99,235,.35)] backdrop-blur-md transition hover:scale-[1.02] hover:bg-blue-500"
            data-focusable="true"
          >
            <span aria-hidden="true">▶</span>
            <span>Play</span>
          </Link>
          <Link
            href={`/tv/movie/${movie.id}`}
            aria-label={`Information about ${movie.title}`}
            className="focusable inline-flex items-center justify-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-3.5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition hover:border-blue-400 hover:bg-blue-600/90"
            data-focusable="true"
          >
            <span aria-hidden="true">ⓘ</span>
            <span>Info</span>
          </Link>
        </div>
      </div>
      <Link href={`/tv/movie/${movie.id}`} className="focusable block truncate font-semibold text-white" data-focusable="true">{movie.title}</Link>
      <span>{movie.year || "Year unknown"}{movie.genre ? ` · ${movie.genre}` : ""}</span>
    </article>
  );
}
