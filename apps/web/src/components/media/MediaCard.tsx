"use client";

import Link from "next/link";
import type { Movie } from "@/lib/media/types";

export function MediaCard({ movie }: { movie: Movie }) {
  return (
    <article className="group w-[150px] shrink-0 sm:w-[180px] lg:w-[210px]">
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-blue-500/10 bg-[#0a101b] shadow-[0_16px_40px_rgba(0,0,0,.45)] transition duration-300 group-hover:-translate-y-1 group-hover:border-blue-500/40 group-hover:shadow-[0_18px_50px_rgba(0,80,255,.16)]">
        {movie.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={movie.posterUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center bg-[linear-gradient(145deg,#0d2344,#0a101b_60%,#05080e)]">
            <span className="text-xl font-black tracking-[0.18em] text-white/20">CH</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/5" />

        {movie.rating !== null ? (
          <span className="absolute right-2 top-2 rounded-lg border border-white/10 bg-black/70 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
            ★ {movie.rating.toFixed(1)}
          </span>
        ) : null}

        <Link
          href={`/tv/watch/${movie.id}`}
          aria-label={`Play ${movie.title}`}
          className="focusable absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-blue-300/50 bg-black/55 text-xl text-white shadow-[0_0_0_1px_rgba(37,99,235,.25),0_8px_28px_rgba(0,0,0,.45)] backdrop-blur-md transition hover:scale-110 hover:bg-blue-600/90 focus:scale-110"
          data-focusable="true"
        >
          ▶
        </Link>

        <Link
          href={`/tv/movie/${movie.id}`}
          aria-label={`Information about ${movie.title}`}
          className="focusable absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/70 text-sm font-bold text-white backdrop-blur transition hover:border-blue-400 hover:bg-blue-600/90"
          data-focusable="true"
        >
          i
        </Link>
      </div>

      <div className="mt-3 min-w-0">
        <Link href={`/tv/movie/${movie.id}`} className="focusable block truncate font-semibold text-white" data-focusable="true">
          {movie.title}
        </Link>
        <span className="mt-1 block truncate text-xs text-slate-400">
          {movie.year || "Year unknown"}{movie.genre ? ` · ${movie.genre}` : ""}
        </span>
      </div>
    </article>
  );
}
