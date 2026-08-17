"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type MediaItem = { name: string; type: "folder" | "file"; path: string };
type ScanResponse = { success: boolean; items?: MediaItem[]; error?: string };
type MetadataMovie = {
  id: number;
  title: string;
  year: string | null;
  overview: string | null;
  rating: number | null;
  posterUrl: string | null;
  genres: string[];
};
type MetadataResponse = { success: boolean; movie?: MetadataMovie | null; error?: string };
type Movie = {
  fileName: string;
  title: string;
  year: string | null;
  path: string;
  metadata: MetadataMovie | null;
  metadataLoading: boolean;
};

const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"];

function isVideoFile(fileName: string) {
  const lower = fileName.toLowerCase();
  return VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function cleanMovieName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, "");
  const yearMatch = withoutExtension.match(/\((19|20)\d{2}\)/);
  const year = yearMatch ? yearMatch[0].replace(/[()]/g, "") : null;
  const title = withoutExtension
    .replace(/\((19|20)\d{2}\)/, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { title: title || withoutExtension, year };
}

export default function MoviesPage() {
  const searchParams = useSearchParams();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [playingMovie, setPlayingMovie] = useState<Movie | null>(null);
  const [infoMovie, setInfoMovie] = useState<Movie | null>(null);

  useEffect(() => {
    setSelectedGenre(searchParams.get("genre") || "All");
  }, [searchParams]);

  useEffect(() => {
    async function loadMovies() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/media/scan", { cache: "no-store" });
        const result = (await response.json()) as ScanResponse;
        if (!response.ok || !result.success) throw new Error(result.error || "Could not load media.");

        const scannedMovies: Movie[] = (result.items ?? [])
          .filter((item) => item.type === "file" && isVideoFile(item.name) && !item.name.startsWith("."))
          .map((item) => {
            const parsed = cleanMovieName(item.name);
            return { fileName: item.name, title: parsed.title, year: parsed.year, path: item.path, metadata: null, metadataLoading: true };
          })
          .sort((a, b) => a.title.localeCompare(b.title));

        setMovies(scannedMovies);

        await Promise.all(scannedMovies.map(async (movie) => {
          try {
            const params = new URLSearchParams({ title: movie.title });
            if (movie.year) params.set("year", movie.year);
            const metadataResponse = await fetch(`/api/media/metadata?${params.toString()}`, { cache: "no-store" });
            const metadataResult = (await metadataResponse.json()) as MetadataResponse;
            setMovies((current) => current.map((item) => item.path === movie.path ? {
              ...item,
              metadata: metadataResponse.ok && metadataResult.success ? metadataResult.movie ?? null : null,
              metadataLoading: false,
            } : item));
          } catch {
            setMovies((current) => current.map((item) => item.path === movie.path ? { ...item, metadataLoading: false } : item));
          }
        }));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not load movies.");
      } finally {
        setLoading(false);
      }
    }
    void loadMovies();
  }, []);

  const genres = useMemo(() => {
    const genreSet = new Set<string>();
    movies.forEach((movie) => movie.metadata?.genres?.forEach((genre) => genreSet.add(genre)));
    return ["All", ...Array.from(genreSet).sort()];
  }, [movies]);

  const filteredMovies = useMemo(() => {
    const query = search.trim().toLowerCase();
    return movies.filter((movie) => {
      const title = movie.metadata?.title ?? movie.title;
      const year = movie.metadata?.year ?? movie.year ?? "";
      const overview = movie.metadata?.overview ?? "";
      const movieGenres = movie.metadata?.genres ?? [];
      const matchesSearch = !query || [title, year, overview, movie.fileName, ...movieGenres].some((value) => value.toLowerCase().includes(query));
      return matchesSearch && (selectedGenre === "All" || movieGenres.includes(selectedGenre));
    });
  }, [movies, search, selectedGenre]);

  function displayTitle(movie: Movie) { return movie.metadata?.title ?? movie.title; }
  function streamUrl(movie: Movie) { return `/api/media/stream?path=${encodeURIComponent(movie.path)}`; }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#02050b] text-white">
      <header className="sticky top-0 z-30 border-b border-blue-400/10 bg-[#02050b]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-lg font-black shadow-lg shadow-blue-600/25">C</span>
            <div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-400">Caz</p><h1 className="text-lg font-bold">Media Vault</h1></div>
          </a>
          <nav className="flex items-center gap-2 text-sm text-white/60">
            <a href="/" className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white">Home</a>
            <span className="rounded-full bg-blue-600/15 px-3 py-2 font-semibold text-blue-300">Movies</span>
            <a href="/settings" className="rounded-full px-3 py-2 hover:bg-white/5 hover:text-white">Settings</a>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-blue-400/10 bg-gradient-to-br from-blue-950/70 via-[#07101f] to-[#02050b] p-6 sm:p-9">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-400">Your library</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Pick something. Press play.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-base">{movies.length} {movies.length === 1 ? "movie" : "movies"} available from your Media Vault.</p></div>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search movies, year, genre..." className="w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-3.5 text-white outline-none placeholder:text-white/25 focus:border-blue-500 lg:max-w-sm" />
          </div>
        </section>

        <section className="mt-6 overflow-x-auto pb-2"><div className="flex min-w-max gap-2">{genres.map((genre) => <button key={genre} type="button" onClick={() => setSelectedGenre(genre)} className={`rounded-full border px-4 py-2 text-sm transition ${selectedGenre === genre ? "border-blue-400/40 bg-blue-600 text-white shadow-lg shadow-blue-600/15" : "border-white/10 bg-white/[0.03] text-white/55 hover:border-blue-400/30 hover:text-white"}`}>{genre}</button>)}</div></section>

        {error ? <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-red-200">{error}</div> : null}
        {loading ? <div className="mt-8 rounded-3xl border border-blue-400/10 bg-blue-950/10 p-8 text-white/50">Scanning your Media Vault...</div> : null}
        {!loading && !error && filteredMovies.length === 0 ? <div className="mt-8 rounded-3xl border border-dashed border-white/15 p-10 text-center"><div className="text-5xl">🎬</div><h3 className="mt-5 text-xl font-semibold">No movies found</h3><p className="mt-2 text-sm text-white/40">Try another search or genre.</p></div> : null}

        {!loading && !error && filteredMovies.length > 0 ? (
          <section className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredMovies.map((movie) => {
              const title = displayTitle(movie);
              const year = movie.metadata?.year ?? movie.year;
              const posterUrl = movie.metadata?.posterUrl;
              const rating = movie.metadata?.rating;
              return (
                <article key={movie.path} className="group min-w-0">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-blue-950 via-slate-950 to-black shadow-xl transition duration-300 group-hover:-translate-y-1 group-hover:border-blue-400/40 group-hover:shadow-blue-950/40">
                    {posterUrl ? <img src={posterUrl} alt={`${title} poster`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <div className="grid h-full place-items-center px-4 text-center text-white/45"><div><div className="text-5xl">🎬</div><p className="mt-3 text-sm">{movie.metadataLoading ? "Loading poster..." : title}</p></div></div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/5 to-transparent opacity-80" />
                    {rating != null ? <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold backdrop-blur">★ {rating.toFixed(1)}</span> : null}
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
                      <button type="button" onClick={() => setPlayingMovie(movie)} aria-label={`Play ${title}`} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-600 text-lg shadow-xl shadow-blue-900/40 transition hover:scale-105 hover:bg-blue-500">▶</button>
                      <button type="button" onClick={() => setInfoMovie(movie)} aria-label={`Information about ${title}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 bg-black/55 text-lg font-serif font-bold backdrop-blur transition hover:border-blue-400/60 hover:bg-blue-600/30">i</button>
                    </div>
                  </div>
                  <div className="px-1 pb-2 pt-3"><h3 className="truncate text-sm font-bold sm:text-base">{title}</h3><p className="mt-1 text-xs text-white/40">{year || "Year unknown"}</p></div>
                </article>
              );
            })}
          </section>
        ) : null}
      </div>

      {playingMovie ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-3 backdrop-blur-sm sm:p-6" onClick={() => setPlayingMovie(null)}>
          <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-blue-400/20 bg-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3"><div className="min-w-0"><p className="truncate font-semibold">{displayTitle(playingMovie)}</p><p className="text-xs text-white/35">Now playing</p></div><button type="button" onClick={() => setPlayingMovie(null)} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xl hover:bg-white/20">×</button></div>
            <video key={playingMovie.path} src={streamUrl(playingMovie)} controls autoPlay playsInline className="max-h-[78vh] w-full bg-black" />
          </div>
        </div>
      ) : null}

      {infoMovie ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setInfoMovie(null)}>
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-blue-400/20 bg-[#07101b] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-400">Movie details</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">{displayTitle(infoMovie)}</h2><p className="mt-1 text-sm text-white/40">{infoMovie.metadata?.year ?? infoMovie.year ?? "Year unknown"}{infoMovie.metadata?.rating != null ? ` · ★ ${infoMovie.metadata.rating.toFixed(1)}` : ""}</p></div><button type="button" onClick={() => setInfoMovie(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-xl hover:bg-white/20">×</button></div>
            {infoMovie.metadata?.genres?.length ? <div className="mt-5 flex flex-wrap gap-2">{infoMovie.metadata.genres.map((genre) => <span key={genre} className="rounded-full border border-blue-400/20 bg-blue-600/10 px-3 py-1 text-xs text-blue-200">{genre}</span>)}</div> : null}
            <p className="mt-5 leading-7 text-white/65">{infoMovie.metadata?.overview || "No description is available for this title yet."}</p>
            <button type="button" onClick={() => { setInfoMovie(null); setPlayingMovie(infoMovie); }} className="mt-6 inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 font-bold shadow-lg shadow-blue-900/30 hover:bg-blue-500"><span>▶</span> Play movie</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
