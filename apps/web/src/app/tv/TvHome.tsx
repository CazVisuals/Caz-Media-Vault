"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MediaCard } from "@/components/media/MediaCard";
import { useTvNavigation } from "@/components/media/useTvNavigation";
import type { LibraryResponse, Movie } from "@/lib/media/types";

export default function TvHome() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useTvNavigation();

  useEffect(() => {
    fetch("/api/media/library", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as LibraryResponse | { success: false; error: string };
        if (!response.ok || !result.success) throw new Error("error" in result ? result.error : "Library unavailable.");
        setMovies(result.movies);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Library unavailable."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return movies;
    return movies.filter((movie) => [movie.title, movie.year || "", movie.genre || "", movie.overview || ""].some((field) => field.toLowerCase().includes(value)));
  }, [movies, query]);
  const featured = filtered[0] || movies[0];
  const recent = [...filtered].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 12);
  const genres = Array.from(new Set(filtered.flatMap((movie) => movie.genres))).sort();

  return (
    <main className="tv-shell">
      <header className="topbar">
        <Link href="/tv" className="brand focusable" data-focusable="true"><span>CAZ</span> MEDIA VAULT</Link>
        <nav><Link href="/tv" className="focusable" data-focusable="true">Movies</Link><Link href="/settings" className="focusable" data-focusable="true">Admin</Link></nav>
      </header>

      {featured ? <section className="hero" style={featured.posterUrl ? { backgroundImage: `linear-gradient(90deg, #05070b 5%, rgba(5,7,11,.82) 45%, rgba(5,7,11,.15)), url(${featured.posterUrl})` } : undefined}>
        <div className="hero-content"><p className="eyebrow">HOME CINEMA</p><h1>{featured.title}</h1><p>{featured.year || "From your private collection"}{featured.genre ? ` · ${featured.genre}` : ""}</p><div className="hero-actions"><Link href={`/tv/movie/${featured.id}`} className="primary-button focusable" data-focusable="true">▶ View movie</Link></div></div>
      </section> : <section className="hero empty-hero"><div className="hero-content"><p className="eyebrow">HOME CINEMA</p><h1>What do you want to watch?</h1><p>Your private Synology library will appear here.</p></div></section>}

      <section className="content-area">
        <label className="search-wrap"><span>Search library</span><input data-focusable="true" className="focusable" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, year, or genre…" /></label>
        {loading ? <div className="state-card">Scanning your media vault…</div> : null}
        {error ? <div className="state-card error">{error}<small>Confirm MEDIA_ROOT points to your mounted NAS.</small></div> : null}
        {!loading && !error && movies.length === 0 ? <div className="state-card">No movie files found outside Inbox.</div> : null}
        {recent.length ? <MovieRow title={query ? "Search Results" : "Recently Added"} movies={query ? filtered : recent} /> : null}
        {!query && genres.map((genre) => <MovieRow key={genre} title={genre} movies={movies.filter((movie) => movie.genres.includes(genre))} />)}
        {!query && movies.length ? <MovieRow title="All Movies" movies={movies} /> : null}
      </section>
    </main>
  );
}

function MovieRow({ title, movies }: { title: string; movies: Movie[] }) {
  if (!movies.length) return null;
  return <section className="movie-row"><h2>{title}</h2><div className="card-rail">{movies.map((movie) => <MediaCard key={movie.id} movie={movie} />)}</div></section>;
}
