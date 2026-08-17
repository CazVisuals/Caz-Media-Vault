"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MediaCard } from "@/components/media/MediaCard";
import { ShowCard } from "@/components/media/ShowCard";
import { TvSidebar } from "@/components/media/TvSidebar";
import { FeaturedHero } from "@/components/media/FeaturedHero";
import { useTvNavigation } from "@/components/media/useTvNavigation";
import { buildCollections } from "@/lib/media/collections";
import type { LibraryResponse, Movie } from "@/lib/media/types";

export default function TvHome() {
  const router = useRouter();
  const [movies, setMovies] = useState<Movie[]>([]);
  const query = "";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [profile, setProfile] = useState<{ displayName?: string; role?: string } | null>(null);
  const [profileState, setProfileState] = useState<{ progress: { mediaId: string; seconds: number; updatedAt: string; completed: boolean }[]; watchlist: string[] }>({ progress: [], watchlist: [] });
  const [customCollections, setCustomCollections] = useState<Record<string, string[]>>({});
  const [hiddenCollections, setHiddenCollections] = useState<string[]>([]);
  useTvNavigation();
  useEffect(() => { void fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json()).then((result: { profile?: { displayName?: string; role?: string } | null }) => { setProfile(result.profile || null); setAdmin(result.profile?.role === "owner" || result.profile?.role === "admin"); }).catch(() => setAdmin(false)); }, []);
  useEffect(() => { void fetch("/api/user/state", { cache: "no-store" }).then((response) => response.json()).then((result) => setProfileState({ progress: result.progress || [], watchlist: result.watchlist || [] })).catch(() => undefined); }, []);
  useEffect(() => { void fetch("/api/media/collections", { cache: "no-store" }).then((response) => response.json()).then((result: { collections?: Record<string, string[]>; hiddenCollections?: string[] }) => { setCustomCollections(result.collections || {}); setHiddenCollections(result.hiddenCollections || []); }).catch(() => undefined); }, []);

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
  const collections = buildCollections(movieItems, customCollections, hiddenCollections);
  const recommended = (() => {
    const watchedGenres = new Set(movies.filter((movie) => watchedIds.has(movie.id)).flatMap((movie) => movie.genres));
    return movieItems.filter((movie) => !watchedIds.has(movie.id) && movie.genres.some((genre) => watchedGenres.has(genre))).sort((a, b) => (b.rating || 0) - (a.rating || 0));
  })();
  const moods = [
    { name: "Family Night", icon: "✦", movies: movieItems.filter((movie) => movie.isKids) },
    { name: "Big Adventure", icon: "◈", movies: movieItems.filter((movie) => movie.genres.some((genre) => /action|adventure|sci-fi|fantasy/i.test(genre))) },
    { name: "Laugh Out Loud", icon: "☺", movies: movieItems.filter((movie) => movie.genres.some((genre) => /comedy/i.test(genre))) },
    { name: "Short & Sweet", icon: "◷", movies: movieItems.filter((movie) => movie.runtimeMinutes && movie.runtimeMinutes <= 105) },
    { name: "Dark & Intense", icon: "◐", movies: movieItems.filter((movie) => movie.genres.some((genre) => /horror|thriller|crime|mystery/i.test(genre))) },
  ].filter((mood) => mood.movies.length);

  return (
    <main className="tv-shell">
      <TvSidebar />
      <header className="topbar">
        <Link href="/tv" className="brand focusable" data-focusable="true"><span>CONSTANT’S</span> HUB</Link>
        <div className="mobile-profile"><span>{(profile?.displayName || "H").slice(0, 1).toUpperCase()}</span><strong>{profile?.displayName || "Home"}</strong></div>
        <nav><Link href="/tv/search" className="header-icon focusable" data-focusable="true" aria-label="Search">⌕</Link><Link href="/tv/offline" className="header-icon focusable" data-focusable="true" aria-label="Downloads">↓</Link><button className={`nav-button nav-refresh focusable${refreshing ? " spinning" : ""}`} data-focusable="true" aria-label="Refresh library" title="Refresh library" onClick={() => window.location.reload()}>↻</button><Link href="/tv/browse?view=movies" className="desktop-nav-link focusable" data-focusable="true">Movies</Link>{admin ? <Link href="/settings" className="desktop-nav-link focusable" data-focusable="true">Admin</Link> : null}</nav>
      </header>

      <FeaturedHero movies={movies} />

      <section className="content-area">
        <section className="welcome-strip"><div><p className="eyebrow">WELCOME BACK</p><h2>{profile?.displayName ? `${profile.displayName}’s cinema` : "Your private cinema"}</h2><p>Pick up where you left off or set the mood for tonight.</p></div><div className="experience-actions"><Link href="/tv/cinema-night" className="secondary-button focusable" data-focusable="true">✦ Cinema Night</Link><Link href="/tv/ambient" className="secondary-button focusable" data-focusable="true">◌ Ambient Mode</Link></div></section>
        <div className="library-tools"><Link href="/tv/search" className="search-launch focusable" data-focusable="true"><span>⌕</span><strong>Search shows, movies, genres…</strong></Link><button className="secondary-button focusable" data-focusable="true" onClick={() => void fetch("/api/media/surprise", { cache: "no-store" }).then((response) => response.json()).then((result: { id?: string }) => { if (result.id) router.push(`/tv/movie/${result.id}`); })}>🎲 Surprise Me</button></div>
        {loading ? <div className="state-card">Scanning your media vault…</div> : null}
        {error ? <div className="state-card error">{error}<small>Confirm MEDIA_ROOT points to your mounted NAS.</small></div> : null}
        {!loading && !error && movies.length === 0 ? <div className="state-card">No movie files found outside Inbox.</div> : null}
        {!query && continueWatching.length ? <MovieRow title="Continue Watching" movies={continueWatching.slice(0, 12)} /> : null}
        {!query && myList.length ? <MovieRow title="My List" movies={myList.slice(0, 12)} /> : null}
        {!query && recommended.length ? <MovieRow title="Recommended For You" movies={recommended.slice(0, 12)} /> : null}
        {!query && moods.map((mood) => <MovieRow key={mood.name} title={`${mood.icon} ${mood.name}`} movies={mood.movies.slice(0, 12)} view="movies" />)}
        {recent.length ? <MovieRow id="recent" title={query ? "Search Results" : "Recently Added"} movies={(query ? filtered : recent).slice(0, 12)} view="recent" /> : null}
        {!query && showGroups.length ? <ShowRow id="shows" shows={showGroups} /> : null}
        {!query && kids.length ? <MovieRow id="kids" title="Kids & Family" movies={kids.slice(0, 12)} view="kids" /> : null}
        {!query && collections.slice(0, 8).map((collection) => <MovieRow key={collection.name} title={`${collection.name} Collection`} movies={collection.movies.slice(0, 12)} href={`/tv/collections?name=${encodeURIComponent(collection.name)}`} />)}
        {!query && genres.filter((genre) => !["kids", "kids & family", "tv shows"].includes(genre.toLowerCase())).slice(0, 5).map((genre) => <MovieRow key={genre} title={genre} movies={movieItems.filter((movie) => movie.genres.includes(genre)).slice(0, 12)} view="movies" />)}
        {!query && movieItems.length ? <MovieRow id="movies" title="All Movies" movies={movieItems.slice(0, 12)} view="movies" /> : null}
      </section>
    </main>
  );
}

function MovieRow({ id, title, movies, view, href }: { id?: string; title: string; movies: Movie[]; view?: string; href?: string }) {
  if (!movies.length) return null;
  return <section className="movie-row" id={id}><div className="row-heading"><h2>{title}</h2>{view || href ? <Link href={href || `/tv/browse?view=${view}`} className="view-all focusable" data-focusable="true">View all →</Link> : null}</div><div className="card-rail">{movies.map((movie) => <MediaCard key={movie.id} movie={movie} />)}</div></section>;
}

function ShowRow({ id, shows }: { id: string; shows: { show: Movie; episodeCount: number }[] }) {
  return <section className="movie-row" id={id}><div className="row-heading"><h2>TV Shows</h2><Link href="/tv/browse?view=shows" className="view-all focusable" data-focusable="true">View all →</Link></div><div className="card-rail">{shows.slice(0, 12).map(({ show, episodeCount }) => <ShowCard key={(show.seriesTitle || show.title).toLowerCase()} show={show} episodeCount={episodeCount} />)}</div></section>;
}
