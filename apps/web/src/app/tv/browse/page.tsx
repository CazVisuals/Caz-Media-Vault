"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MediaCard } from "@/components/media/MediaCard";
import { ShowCard } from "@/components/media/ShowCard";
import { TvSidebar } from "@/components/media/TvSidebar";
import { useTvNavigation } from "@/components/media/useTvNavigation";
import type { LibraryResponse, Movie } from "@/lib/media/types";

const labels = { recent: "Recently Added", shows: "TV Shows", kids: "Kids & Family", movies: "Movies" } as const;

export default function BrowsePage() {
  return <Suspense fallback={<main className="browse-shell"><TvSidebar /><div className="state-card">Loading library…</div></main>}><BrowseContent /></Suspense>;
}

function BrowseContent() {
  const params = useSearchParams();
  const requested = params.get("view") || "movies";
  const view = requested in labels ? requested as keyof typeof labels : "movies";
  const [movies, setMovies] = useState<Movie[]>([]);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const [error, setError] = useState("");
  useTvNavigation();

  useEffect(() => {
    fetch("/api/media/library", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as LibraryResponse | { success: false; error: string };
      if (!response.ok || !result.success) throw new Error("error" in result ? result.error : "Library unavailable.");
      setMovies(result.movies);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Library unavailable."));
  }, []);

  const genres = useMemo(() => ["All", ...Array.from(new Set(movies.filter((item) => item.mediaType === "movie").flatMap((item) => item.genres))).sort()], [movies]);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    let items = view === "shows" ? movies.filter((item) => item.mediaType === "tv") : movies.filter((item) => item.mediaType !== "tv");
    if (view === "kids") items = movies.filter((item) => item.isKids);
    if (view === "recent") items = [...movies].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    if (genre !== "All" && view === "movies") items = items.filter((item) => item.genres.includes(genre));
    if (text) items = items.filter((item) => [item.title, item.seriesTitle || "", item.year || "", ...item.genres].some((value) => value.toLowerCase().includes(text)));
    return items;
  }, [genre, movies, query, view]);

  const shows = useMemo(() => {
    const grouped = new Map<string, Movie[]>();
    for (const episode of filtered) {
      const key = (episode.seriesTitle || episode.title).toLowerCase();
      grouped.set(key, [...(grouped.get(key) || []), episode]);
    }
    return Array.from(grouped.values()).map((episodes) => ({ show: episodes[0], episodeCount: episodes.length }));
  }, [filtered]);

  return <main className="browse-shell"><TvSidebar /><header className="browse-header"><p className="eyebrow">YOUR LIBRARY</p><h1>{labels[view]}</h1><p>{view === "shows" ? shows.length : filtered.length} titles</p></header>
    <section className="browse-tools"><input className="focusable" data-focusable="true" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${labels[view].toLowerCase()}…`} />{view === "movies" ? <select className="focusable" data-focusable="true" value={genre} onChange={(event) => setGenre(event.target.value)}>{genres.map((item) => <option key={item}>{item}</option>)}</select> : null}</section>
    {error ? <div className="state-card error">{error}</div> : null}
    <section className="library-grid">{view === "shows" ? shows.map(({ show, episodeCount }) => <ShowCard key={(show.seriesTitle || show.title).toLowerCase()} show={show} episodeCount={episodeCount} />) : filtered.map((movie) => <MediaCard key={movie.id} movie={movie} />)}</section>
  </main>;
}
