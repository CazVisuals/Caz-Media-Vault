import type { Movie } from "@/lib/media/types";

type SearchMovie = {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  vote_average?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
};

type DetailsMovie = SearchMovie & { runtime?: number | null; genres?: { id: number; name: string }[] };
type CacheEntry = { expiresAt: number; movie: Partial<Movie> | null };

const CACHE_TTL = 6 * 60 * 60 * 1000;
const metadataCache = new Map<string, CacheEntry>();

function image(path: string | null | undefined, size: "w500" | "w1280") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

async function fetchMetadata(movie: Movie, token: string): Promise<Partial<Movie> | null> {
  const cacheKey = `${movie.title.toLowerCase()}|${movie.year || ""}`;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.movie;

  const searchUrl = new URL("https://api.themoviedb.org/3/search/movie");
  searchUrl.searchParams.set("query", movie.title);
  searchUrl.searchParams.set("include_adult", "false");
  searchUrl.searchParams.set("language", "en-US");
  if (movie.year) searchUrl.searchParams.set("year", movie.year);

  const headers = { Authorization: `Bearer ${token}`, accept: "application/json" };
  const searchResponse = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(8000) });
  if (!searchResponse.ok) throw new Error(`TMDB search failed (${searchResponse.status}).`);
  const search = await searchResponse.json() as { results?: SearchMovie[] };
  const match = search.results?.[0];
  if (!match) {
    metadataCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL, movie: null });
    return null;
  }

  const detailsResponse = await fetch(`https://api.themoviedb.org/3/movie/${match.id}?language=en-US`, { headers, signal: AbortSignal.timeout(8000) });
  const details: DetailsMovie = detailsResponse.ok ? await detailsResponse.json() as DetailsMovie : match;
  const metadata: Partial<Movie> = {
    tmdbId: match.id,
    title: details.title || movie.title,
    year: details.release_date?.slice(0, 4) || movie.year,
    overview: details.overview || null,
    rating: typeof details.vote_average === "number" ? details.vote_average : null,
    runtimeMinutes: details.runtime || null,
    genres: details.genres?.map((genre) => genre.name) || movie.genres,
    posterUrl: movie.posterUrl || image(details.poster_path, "w500"),
    backdropUrl: image(details.backdrop_path, "w1280"),
  };
  metadataCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL, movie: metadata });
  return metadata;
}

export async function enrichMovies(movies: Movie[]) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (!token || movies.length === 0) return movies;
  const result = [...movies];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, movies.length) }, async () => {
    while (cursor < movies.length) {
      const index = cursor++;
      try {
        const metadata = await fetchMetadata(movies[index], token);
        if (metadata) result[index] = { ...movies[index], ...metadata };
      } catch {
        // The local catalog remains usable whenever TMDB is unavailable.
      }
    }
  });
  await Promise.all(workers);
  return result;
}
