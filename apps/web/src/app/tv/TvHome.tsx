"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MediaCard } from "@/components/media/MediaCard";
import { ShowCard } from "@/components/media/ShowCard";
import { TvSidebar } from "@/components/media/TvSidebar";
import { useTvNavigation } from "@/components/media/useTvNavigation";
import type { LibraryResponse, Movie } from "@/lib/media/types";

type WatchProgress = Record<string, number>;

export default function TvHome() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [watchProgress, setWatchProgress] = useState<WatchProgress>({});
  useTvNavigation();

  useEffect(() => {
    const readProgress = () => {
      const next: WatchProgress = {};
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key) continue;
        const prefix = key.startsWith("constants-hub-progress:") ? "constants-hub-progress:" : key.startsWith("cmv-progress:") ? "cmv-progress:" : null;
        if (!prefix) continue;
        const seconds = Number(localStorage.getItem(key)) || 0;
        if (seconds > 30) next[key.slice(prefix.length)] = Math.max(next[key.slice(prefix.length)] || 0, seconds);
      }
      setWatchProgress(next);
    };
    readProgress();
    window.addEventListener("focus", readProgress);
    document.addEventListener("visibilitychange", readProgress);
    return () => {
      window.removeEventListener("focus", readProgress);
      document.removeEventListener("visibilitychange", readProgress);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadLibrary(background = false) {
      if (background) setRefreshing(true); else setLoading(true);
      try {
        const response = await fetch(`/api/media/library?refresh=${Date.now()}`, { cache: "no-store" });
        const result = await response.json() as LibraryResponse | { success: false; error: string };
        if (!response.ok || !result.success) throw new Error("error" in result ? result.error : "Library unavailable.");
        if (active) { setMovies(result.movies); setError(""); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Library unavailable.");
      } finally {
        if (active) { setLoading(false); setRefreshing(false); }
      }
    }
    const refreshVisible = () => { if (document.visibilityState === "visible") void loadLibrary(true); };
    void loadLibrary();
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const interval = window.setInterval(() => void loadLibrary(true), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return movies;
    return movies.filter((movie) => [movie.title, movie.year || "", movie.genre || "", movie.overview || ""].some((field) => field.toLowerCase().includes(value)));
  }, [movies, query]);

  const movieItems = filtered.filter((movie) => movie.mediaType !== "tv");
  const shows = filtered.filter((movie) => movie.mediaType === "tv");
  const showGroups = useMemo(() => {
    const groups = new Map<string, Movie[]>();
    for (const episode of shows) {
      const key = (episode.seriesTitle || episode.title).toLowerCase();
      groups.set(key, [...(groups.get(key) || []), episode]);
    }
    return Array.from(groups.values()).map((episodes) => ({ show: episodes[0], episodeCount: episodes.length }));
  }, [shows]);

  const continueWatching = useMemo(() => movies.filter((movie) => {
    const seconds = watchProgress[movie.id];
    if (!seconds || seconds <= 30) return false;
    if (movie.runtimeMinutes && seconds >= movie.runtimeMinutes * 60 - 60) return false;
    return true;
  }).sort((a, b) => (watchProgress[b.id] || 0) - (watchProgress[a.id] || 0)).slice(0, 12), [movies, watchProgress]);

  const featured = movieItems[0] || filtered[0] || movies[0];
  const recent = [...filtered].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 12);
  const genres = Array.from(new Set(movieItems.flatMap((movie) => movie.genres))).sort();
  const kids = filtered.filter((movie) => movie.isKids);
  const heroImage = featured?.backdropUrl || featured?.posterUrl;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#02050a] text-white lg:pl-[220px]">
      <TvSidebar />
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-blue-500/10 bg-[#02050a]/90 px-5 backdrop-blur-xl sm:px-8 lg:px-12">
        <Link href="/tv" className="focusable text-sm font-black tracking-[.18em]" data-focusable="true"><span className="text-blue-500">CONSTANT’S</span> HUB</Link>
        <nav className="flex items-center gap-2 text-sm text-slate-300">
          <button className="focusable rounded-full border border-white/10 bg-white/5 px-4 py-2 hover:border-blue-500/40 hover:text-white" data-focusable="true" onClick={() => window.location.reload()}>{refreshing ? "Refreshing…" : "Refresh"}</button>
          <Link href="/settings" className="focusable rounded-full border border-white/10 bg-white/5 px-4 py-2 hover:border-blue-500/40 hover:text-white" data-focusable="true">Admin</Link>
        </nav>
      </header>

      {featured ? (
        <section className="relative mx-3 mt-3 min-h-[560px] overflow-hidden rounded-[28px] border border-blue-500/20 sm:mx-6 lg:mx-8 lg:min-h-[650px]">
          {heroImage ? <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover object-center" /> : null}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,5,10,.97)_0%,rgba(2,5,10,.76)_43%,rgba(2,5,10,.2)_75%),linear-gradient(0deg,#02050a_0%,transparent_55%)]" />
          <div className="relative z-10 flex min-h-[560px] max-w-3xl flex-col justify-end p-6 sm:p-10 lg:min-h-[650px] lg:p-14">
            <p className="text-xs font-black tracking-[.34em] text-blue-400">FEATURED MOVIE</p>
            <h1 className="mt-3 text-5xl font-black leading-[.9] tracking-[-.05em] sm:text-7xl lg:text-8xl">{featured.title}</h1>
            <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-200">
              {featured.year ? <span className="rounded-lg border border-white/15 bg-black/35 px-3 py-1.5">{featured.year}</span> : null}
              {featured.genres.slice(0, 2).map((genre) => <span key={genre} className="rounded-lg border border-white/15 bg-black/35 px-3 py-1.5">{genre}</span>)}
              {featured.rating !== null ? <span className="rounded-lg border border-white/15 bg-black/35 px-3 py-1.5">★ {featured.rating.toFixed(1)}</span> : null}
              {featured.runtimeMinutes ? <span className="rounded-lg border border-white/15 bg-black/35 px-3 py-1.5">{featured.runtimeMinutes} min</span> : null}
            </div>
            {featured.overview ? <p className="mt-5 line-clamp-3 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{featured.overview}</p> : null}
            <div className="mt-7 flex items-center gap-3">
              <Link href={`/tv/watch/${featured.id}`} className="focusable inline-flex min-h-14 items-center gap-3 rounded-full bg-blue-600 px-7 font-bold text-white shadow-[0_12px_38px_rgba(37,99,235,.35)] transition hover:bg-blue-500" data-focusable="true">▶ <span>{watchProgress[featured.id] > 30 ? "Resume Movie" : "Play Movie"}</span></Link>
              <Link href={`/tv/movie/${featured.id}`} aria-label={`Information about ${featured.title}`} className="focusable grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-black/45 text-xl font-bold text-white backdrop-blur transition hover:border-blue-400 hover:bg-blue-600/80" data-focusable="true">i</Link>
            </div>
          </div>
          <Link href={`/tv/watch/${featured.id}`} aria-label={`Play ${featured.title}`} className="focusable absolute left-1/2 top-[38%] z-20 hidden h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-blue-500 bg-black/45 text-4xl shadow-[0_0_55px_rgba(37,99,235,.35)] backdrop-blur-md transition hover:scale-110 hover:bg-blue-600/80 md:grid" data-focusable="true">▶</Link>
        </section>
      ) : null}

      <section className="px-4 pb-28 pt-8 sm:px-8 lg:px-10">
        <label className="mb-9 block max-w-2xl"><span className="mb-2 block text-xs font-bold uppercase tracking-[.16em] text-slate-500">Search library</span><input data-focusable="true" className="focusable h-14 w-full rounded-2xl border border-blue-500/15 bg-[#09101b] px-5 text-white outline-none placeholder:text-slate-600 focus:border-blue-500" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, year, or genre…" /></label>
        {loading ? <div className="state-card">Scanning your media vault…</div> : null}
        {error ? <div className="state-card error">{error}<small>Confirm MEDIA_ROOT points to your mounted NAS.</small></div> : null}
        {!loading && !error && movies.length === 0 ? <div className="state-card">No movie files found outside Inbox.</div> : null}
        {!query && continueWatching.length ? <MovieRow id="continue" title="Continue Watching" movies={continueWatching} progress={watchProgress} /> : null}
        {recent.length ? <MovieRow id="recent" title={query ? "Search Results" : "Recently Added"} movies={(query ? filtered : recent).slice(0, 12)} view="recent" /> : null}
        {!query && showGroups.length ? <ShowRow id="shows" shows={showGroups} /> : null}
        {!query && kids.length ? <MovieRow id="kids" title="Kids & Family" movies={kids.slice(0, 12)} view="kids" /> : null}
        {!query && genres.filter((genre) => !["kids", "kids & family", "tv shows"].includes(genre.toLowerCase())).slice(0, 5).map((genre) => <MovieRow key={genre} title={genre} movies={movieItems.filter((movie) => movie.genres.includes(genre)).slice(0, 12)} view="movies" />)}
        {!query && movieItems.length ? <MovieRow id="movies" title="All Movies" movies={movieItems.slice(0, 12)} view="movies" /> : null}
      </section>
    </main>
  );
}

function MovieRow({ id, title, movies, view, progress }: { id?: string; title: string; movies: Movie[]; view?: string; progress?: WatchProgress }) {
  if (!movies.length) return null;
  return <section className="mb-10" id={id}><div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-xl font-bold sm:text-2xl">{title}</h2>{view ? <Link href={`/tv/browse?view=${view}`} className="focusable rounded-lg px-2 py-2 font-semibold text-blue-400 hover:text-blue-300" data-focusable="true">See All ›</Link> : null}</div><div className="flex gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{movies.map((movie) => <div key={movie.id} className="shrink-0"><MediaCard movie={movie} />{progress?.[movie.id] && movie.runtimeMinutes ? <div className="mx-1 mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, (progress[movie.id] / (movie.runtimeMinutes * 60)) * 100)}%` }} /></div> : null}</div>)}</div></section>;
}

function ShowRow({ id, shows }: { id: string; shows: { show: Movie; episodeCount: number }[] }) {
  return <section className="movie-row" id={id}><div className="row-heading"><h2>TV Shows</h2><Link href="/tv/browse?view=shows" className="view-all focusable" data-focusable="true">See All ›</Link></div><div className="card-rail">{shows.slice(0, 12).map(({ show, episodeCount }) => <ShowCard key={(show.seriesTitle || show.title).toLowerCase()} show={show} episodeCount={episodeCount} />)}</div></section>;
}
