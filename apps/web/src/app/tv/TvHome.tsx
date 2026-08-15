"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MediaCard } from "@/components/media/MediaCard";
import { ShowCard } from "@/components/media/ShowCard";
import { TvSidebar } from "@/components/media/TvSidebar";
import { useTvNavigation } from "@/components/media/useTvNavigation";
import type { LibraryResponse, Movie } from "@/lib/media/types";

export default function TvHome() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  useTvNavigation();

  useEffect(() => {
    let active = true;
    async function loadLibrary(background = false) {
      if (background) setRefreshing(true);
      else setLoading(true);
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

    const refreshVisible = () => {
      if (document.visibilityState === "visible") void loadLibrary(true);
    };
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
  const featured = movieItems[0] || filtered[0] || movies[0];
  const recent = [...filtered].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 12);
  const genres = Array.from(new Set(movieItems.flatMap((movie) => movie.genres))).sort();
  const kids = filtered.filter((movie) => movie.isKids);

  return (
    <main className="tv-shell">
      <TvSidebar />
      <header className="topbar">
        <Link href="/tv" className="brand focusable" data-focusable="true"><span>CONSTANT’S</span> HUB</Link>
        <nav><button className="nav-button focusable" data-focusable="true" onClick={() => window.location.reload()}>{refreshing ? "Refreshing…" : "Refresh"}</button><Link href="/tv" className="focusable" data-focusable="true">Movies</Link><Link href="/settings" className="focusable" data-focusable="true">Admin</Link></nav>
      </header>

      {featured ? <section className="hero" style={featured.posterUrl ? { backgroundImage: `linear-gradient(90deg, #05070b 5%, rgba(5,7,11,.82) 45%, rgba(5,7,11,.15)), url(${featured.posterUrl})` } : undefined}>
        <div className="hero-content"><p className="eyebrow">HOME CINEMA</p><h1>{featured.title}</h1><p>{featured.year || "From your private collection"}{featured.genre ? ` · ${featured.genre}` : ""}</p><div className="hero-actions"><Link href={`/tv/movie/${featured.id}`} className="primary-button focusable" data-focusable="true">▶ View movie</Link></div></div>
      </section> : <section className="hero empty-hero"><div className="hero-content"><p className="eyebrow">HOME CINEMA</p><h1>What do you want to watch?</h1><p>Your private Synology library will appear here.</p></div></section>}

      <section className="content-area">
        <label className="search-wrap"><span>Search library</span><input data-focusable="true" className="focusable" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, year, or genre…" /></label>
        {loading ? <div className="state-card">Scanning your media vault…</div> : null}
        {error ? <div className="state-card error">{error}<small>Confirm MEDIA_ROOT points to your mounted NAS.</small></div> : null}
        {!loading && !error && movies.length === 0 ? <div className="state-card">No movie files found outside Inbox.</div> : null}
        {recent.length ? <MovieRow id="recent" title={query ? "Search Results" : "Recently Added"} movies={(query ? filtered : recent).slice(0, 12)} view="recent" /> : null}
        {!query && showGroups.length ? <ShowRow id="shows" shows={showGroups} /> : null}
        {!query && kids.length ? <MovieRow id="kids" title="Kids & Family" movies={kids.slice(0, 12)} view="kids" /> : null}
        {!query && genres.filter((genre) => !["kids", "kids & family", "tv shows"].includes(genre.toLowerCase())).slice(0, 5).map((genre) => <MovieRow key={genre} title={genre} movies={movieItems.filter((movie) => movie.genres.includes(genre)).slice(0, 12)} view="movies" />)}
        {!query && movieItems.length ? <MovieRow id="movies" title="All Movies" movies={movieItems.slice(0, 12)} view="movies" /> : null}
      </section>
    </main>
  );
}

function MovieRow({ id, title, movies, view }: { id?: string; title: string; movies: Movie[]; view?: string }) {
  if (!movies.length) return null;
  return <section className="movie-row" id={id}><div className="row-heading"><h2>{title}</h2>{view ? <Link href={`/tv/browse?view=${view}`} className="view-all focusable" data-focusable="true">View all →</Link> : null}</div><div className="card-rail">{movies.map((movie) => <MediaCard key={movie.id} movie={movie} />)}</div></section>;
}

function ShowRow({ id, shows }: { id: string; shows: { show: Movie; episodeCount: number }[] }) {
  return <section className="movie-row" id={id}><div className="row-heading"><h2>TV Shows</h2><Link href="/tv/browse?view=shows" className="view-all focusable" data-focusable="true">View all →</Link></div><div className="card-rail">{shows.slice(0, 12).map(({ show, episodeCount }) => <ShowCard key={(show.seriesTitle || show.title).toLowerCase()} show={show} episodeCount={episodeCount} />)}</div></section>;
}
