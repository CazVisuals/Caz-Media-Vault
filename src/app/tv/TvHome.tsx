"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MediaCard } from "@/components/media/MediaCard";
import { ShowCard } from "@/components/media/ShowCard";
import { TvSidebar } from "@/components/media/TvSidebar";
import { FeaturedHero } from "@/components/media/FeaturedHero";
import { useTvNavigation } from "@/components/media/useTvNavigation";
import type { LibraryResponse, Movie } from "@/lib/media/types";

export default function TvHome() {
  const router = useRouter();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [owner, setOwner] = useState(false);
  const [profileState, setProfileState] = useState<{ progress: { mediaId: string; seconds: number; updatedAt: string; completed: boolean }[]; watchlist: string[] }>({ progress: [], watchlist: [] });
  const [customCollections, setCustomCollections] = useState<Record<string, string[]>>({});
  useTvNavigation();
  useEffect(() => { void fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json()).then((result: { profile?: { role?: string } | null }) => setOwner(result.profile?.role === "owner")).catch(() => setOwner(false)); }, []);
  useEffect(() => { void fetch("/api/user/state", { cache: "no-store" }).then((response) => response.json()).then((result) => setProfileState({ progress: result.progress || [], watchlist: result.watchlist || [] })).catch(() => undefined); }, []);
  useEffect(() => { void fetch("/api/media/collections", { cache: "no-store" }).then((response) => response.json()).then((result: { collections?: Record<string, string[]> }) => setCustomCollections(result.collections || {})).catch(() => undefined); }, []);

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
  const recent = [...filtered].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 12);
  const genres = Array.from(new Set(movieItems.flatMap((movie) => movie.genres))).sort();
  const kids = filtered.filter((movie) => movie.isKids);
  const continueWatching = profileState.progress.filter((item) => item.seconds > 30 && !item.completed).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((item) => movies.find((movie) => movie.id === item.mediaId)).filter((movie): movie is Movie => Boolean(movie));
  const myList = profileState.watchlist.map((id) => movies.find((movie) => movie.id === id)).filter((movie): movie is Movie => Boolean(movie));
  const watchedIds = new Set(profileState.progress.filter((item) => item.completed).map((item) => item.mediaId));
  const collections = (() => {
    const groups = new Map<string, Movie[]>();
    const inferred = (movie: Movie) => {
      const searchable = `${movie.title} ${movie.collection || ""}`;
      const names = new Set<string>();
      if (movie.collection) names.add(movie.collection);
      if (/star[\s-]*wars/i.test(searchable)) names.add("Star Wars");
      if (/james bond|\b007\b/i.test(searchable)) names.add("James Bond");
      if (/lord of the rings|\bhobbit\b|middle[\s-]*earth/i.test(searchable)) names.add("Middle-earth");
      if (/spider[\s-]*man|spider[\s-]*verse|venom|avengers|iron[\s-]*man|captain america|captain marvel|thor|black panther|guardians of the galaxy|doctor strange|ant[\s-]*man|deadpool|wolverine|\bx[\s-]*men\b|fantastic four|marvel/i.test(searchable)) names.add("Marvel");
      if (/christmas|holiday|santa/i.test(searchable)) names.add("Holiday");
      return [...names];
    };
    for (const movie of movieItems) {
      for (const name of inferred(movie)) {
        const items = groups.get(name) || [];
        if (!items.some((item) => item.id === movie.id)) groups.set(name, [...items, movie]);
      }
    }
    for (const [name, ids] of Object.entries(customCollections)) { const items = ids.map((id) => movieItems.find((movie) => movie.id === id)).filter((movie): movie is Movie => Boolean(movie)); if (items.length) groups.set(name, items); }
    return Array.from(groups.entries()).filter(([, items]) => items.length > 0);
  })();
  const recommended = (() => {
    const watchedGenres = new Set(movies.filter((movie) => watchedIds.has(movie.id)).flatMap((movie) => movie.genres));
    return movieItems.filter((movie) => !watchedIds.has(movie.id) && movie.genres.some((genre) => watchedGenres.has(genre))).sort((a, b) => (b.rating || 0) - (a.rating || 0));
  })();

  return (
    <main className="tv-shell">
      <TvSidebar />
      <header className="topbar">
        <Link href="/tv" className="brand focusable" data-focusable="true"><span>CONSTANT’S</span> HUB</Link>
        <nav><button className={`nav-button nav-refresh focusable${refreshing ? " spinning" : ""}`} data-focusable="true" aria-label="Refresh library" title="Refresh library" onClick={() => window.location.reload()}>↻</button><Link href="/tv/browse?view=movies" className="focusable" data-focusable="true">Movies</Link>{owner ? <Link href="/settings" className="focusable" data-focusable="true">Admin</Link> : null}</nav>
      </header>

      <FeaturedHero movies={movies} />

      <section className="content-area">
        <div className="library-tools"><label className="search-wrap"><span>Search library</span><input data-focusable="true" className="focusable" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, year, or genre…" /></label><button className="secondary-button focusable" data-focusable="true" onClick={() => void fetch("/api/media/surprise", { cache: "no-store" }).then((response) => response.json()).then((result: { id?: string }) => { if (result.id) router.push(`/tv/movie/${result.id}`); })}>🎲 Surprise Me</button></div>
        {loading ? <div className="state-card">Scanning your media vault…</div> : null}
        {error ? <div className="state-card error">{error}<small>Confirm MEDIA_ROOT points to your mounted NAS.</small></div> : null}
        {!loading && !error && movies.length === 0 ? <div className="state-card">No movie files found outside Inbox.</div> : null}
        {!query && continueWatching.length ? <MovieRow title="Continue Watching" movies={continueWatching.slice(0, 12)} /> : null}
        {!query && myList.length ? <MovieRow title="My List" movies={myList.slice(0, 12)} /> : null}
        {!query && recommended.length ? <MovieRow title="Recommended For You" movies={recommended.slice(0, 12)} /> : null}
        {recent.length ? <MovieRow id="recent" title={query ? "Search Results" : "Recently Added"} movies={(query ? filtered : recent).slice(0, 12)} view="recent" /> : null}
        {!query && showGroups.length ? <ShowRow id="shows" shows={showGroups} /> : null}
        {!query && kids.length ? <MovieRow id="kids" title="Kids & Family" movies={kids.slice(0, 12)} view="kids" /> : null}
        {!query && collections.map(([name, items]) => <MovieRow key={name} title={`${name} Collection`} movies={items.slice(0, 12)} />)}
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
