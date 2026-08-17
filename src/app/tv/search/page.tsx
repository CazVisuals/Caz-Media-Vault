"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MediaCard } from "@/components/media/MediaCard";
import { ShowCard } from "@/components/media/ShowCard";
import { TvSidebar } from "@/components/media/TvSidebar";
import { useTvNavigation } from "@/components/media/useTvNavigation";
import type { LibraryResponse, Movie } from "@/lib/media/types";

const suggestions = ["Family night", "Action adventure", "Funny movies", "Sci-fi", "Short movies", "Crime shows"];

export default function SearchPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  useTvNavigation();

  useEffect(() => {
    void fetch("/api/media/library", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: LibraryResponse) => { if (result.success) setMovies(result.movies); })
      .finally(() => setLoading(false));
  }, []);

  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [...movies].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 18);
    return movies.filter((movie) => [movie.title, movie.seriesTitle || "", movie.year || "", ...movie.genres, movie.overview || ""].some((field) => field.toLowerCase().includes(value)));
  }, [movies, query]);
  const showGroups = useMemo(() => {
    const groups = new Map<string, Movie[]>();
    for (const item of results.filter((movie) => movie.mediaType === "tv")) {
      const key = (item.seriesTitle || item.title).toLowerCase();
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return [...groups.values()].map((episodes) => ({ show: episodes[0], episodeCount: episodes.length }));
  }, [results]);
  const movieResults = results.filter((movie) => movie.mediaType !== "tv");

  return <main className="tv-shell search-page">
    <TvSidebar />
    <header className="search-header"><div><p className="eyebrow">DISCOVER</p><h1>Search</h1></div><Link href="/tv/offline" className="header-icon focusable" data-focusable="true" aria-label="Downloads">↓</Link></header>
    <section className="search-content">
      <label className="search-command"><span aria-hidden="true">⌕</span><input ref={inputRef} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shows, movies, genres…" data-focusable="true" className="focusable" />{query ? <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear search">×</button> : null}</label>
      {!query ? <div className="search-suggestions"><h2>Explore your library</h2><div>{suggestions.map((suggestion) => <button key={suggestion} className="focusable" data-focusable="true" onClick={() => setQuery(suggestion.replace(" movies", "").replace(" shows", ""))}>✦ {suggestion}</button>)}</div></div> : null}
      <div className="search-result-heading"><h2>{query ? `Results for “${query}”` : "Top picks from your library"}</h2><span>{movieResults.length + showGroups.length} titles</span></div>
      {loading ? <div className="state-card">Loading your library…</div> : null}
      {!loading && !results.length ? <div className="state-card"><strong>No titles found</strong><small>Try a title, actor, year, genre, or a broader phrase.</small></div> : null}
      {showGroups.length ? <section className="search-section"><h3>TV Shows</h3><div className="search-grid">{showGroups.map(({ show, episodeCount }) => <ShowCard key={(show.seriesTitle || show.title).toLowerCase()} show={show} episodeCount={episodeCount} />)}</div></section> : null}
      {movieResults.length ? <section className="search-section"><h3>Movies</h3><div className="search-grid">{movieResults.map((movie) => <MediaCard key={movie.id} movie={movie} />)}</div></section> : null}
    </section>
  </main>;
}
