"use client";

import Link from "next/link";
import type { Movie } from "@/lib/media/types";

export function MediaCard({ movie }: { movie: Movie }) {
  return (
    <article className="media-card group">
      <div className="poster-shell !border !border-blue-500/15 !bg-[#08101b] transition duration-300 group-hover:!border-blue-400/45 group-hover:!shadow-[0_20px_55px_rgba(14,95,255,.18)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {movie.posterUrl ? <img src={movie.posterUrl} alt="" className="poster" /> : <div className="poster-fallback !bg-[linear-gradient(145deg,#0d2344,#10141d_60%,#05080e)]"><span>CH</span></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/5" />
        {movie.rating !== null ? <span className="rating">★ {movie.rating.toFixed(1)}</span> : null}
        <Link href={`/tv/watch/${movie.id}`} aria-label={`Play ${movie.title}`} className="focusable absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-blue-300/50 bg-black/55 text-xl text-white shadow-[0_0_34px_rgba(37,99,235,.28)] backdrop-blur-md transition hover:scale-110 hover:bg-blue-600/90" data-focusable="true">▶</Link>
        <Link href={`/tv/movie/${movie.id}`} aria-label={`Information about ${movie.title}`} className="focusable absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/70 text-sm font-bold text-white backdrop-blur transition hover:border-blue-400 hover:bg-blue-600/90" data-focusable="true">i</Link>
      </div>
      <Link href={`/tv/movie/${movie.id}`} className="focusable block truncate font-semibold text-white" data-focusable="true">{movie.title}</Link>
      <span>{movie.year || "Year unknown"}{movie.genre ? ` · ${movie.genre}` : ""}</span>
    </article>
  );
}
