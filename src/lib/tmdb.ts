import type { Movie } from "@/lib/media/types";
import { isKidsMovie } from "@/lib/media/kids";
import { applyKidsOverrides } from "@/lib/media/kids-overrides";

type SearchMovie = {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  vote_average?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
  popularity?: number;
  name?: string;
  first_air_date?: string;
};

type DetailsMovie = SearchMovie & {
  runtime?: number | null;
  genres?: { id: number; name: string }[];
  tagline?: string;
  belongs_to_collection?: { name?: string } | null;
  release_dates?: { results?: { iso_3166_1?: string; release_dates?: { certification?: string; type?: number }[] }[] };
  videos?: { results?: { key?: string; site?: string; type?: string; official?: boolean; name?: string }[] };
};
type CacheEntry = { expiresAt: number; movie: Partial<Movie> | null };

const CACHE_TTL = 6 * 60 * 60 * 1000;
const metadataCache = new Map<string, CacheEntry>();

function image(path: string | null | undefined, size: "w500" | "w1280") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function bestMatch(results: SearchMovie[], movie: Movie) {
  const wantedTitle = normalized(movie.title);
  return [...results].sort((a, b) => score(b) - score(a))[0];

  function score(candidate: SearchMovie) {
    const candidateTitle = normalized(candidate.title || candidate.name || "");
    const candidateYear = (candidate.release_date || candidate.first_air_date)?.slice(0, 4);
    let value = Math.min(candidate.popularity || 0, 100) / 100;
    if (candidateTitle === wantedTitle) value += 8;
    else if (candidateTitle.includes(wantedTitle) || wantedTitle.includes(candidateTitle)) value += 3;
    if (movie.year && candidateYear === movie.year) value += 5;
    return value;
  }
}

function certification(details: DetailsMovie) {
  const releases = details.release_dates?.results?.find((result) => result.iso_3166_1 === "US")?.release_dates || [];
  return releases.find((release) => release.certification && release.type === 3)?.certification
    || releases.find((release) => release.certification)?.certification
    || null;
}

async function fetchMetadata(movie: Movie, token: string): Promise<Partial<Movie> | null> {
  const cacheKey = `${movie.title.toLowerCase()}|${movie.year || ""}`;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.movie;

  const type = movie.mediaType === "tv" ? "tv" : "movie";
  const lookupTitle = movie.seriesTitle || movie.title;
  const searchUrl = new URL(`https://api.themoviedb.org/3/search/${type}`);
  searchUrl.searchParams.set("query", lookupTitle);
  searchUrl.searchParams.set("include_adult", "false");
  searchUrl.searchParams.set("language", "en-US");
  if (movie.year) searchUrl.searchParams.set(type === "tv" ? "first_air_date_year" : "year", movie.year);

  const headers = { Authorization: `Bearer ${token}`, accept: "application/json" };
  const searchResponse = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(8000) });
  if (!searchResponse.ok) throw new Error(`TMDB search failed (${searchResponse.status}).`);
  const search = await searchResponse.json() as { results?: SearchMovie[] };
  const match = bestMatch(search.results || [], movie);
  if (!match) {
    metadataCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL, movie: null });
    return null;
  }

  const append = type === "movie" ? "release_dates,videos" : "videos";
  const detailsResponse = await fetch(`https://api.themoviedb.org/3/${type}/${match.id}?language=en-US&append_to_response=${append}`, { headers, signal: AbortSignal.timeout(8000) });
  const details: DetailsMovie = detailsResponse.ok ? await detailsResponse.json() as DetailsMovie : match;
  const trailer = details.videos?.results?.find((video) => video.site === "YouTube" && video.type === "Trailer" && video.official)
    || details.videos?.results?.find((video) => video.site === "YouTube" && video.type === "Trailer")
    || details.videos?.results?.find((video) => video.site === "YouTube" && video.type === "Teaser");
  const metadata: Partial<Movie> = {
    tmdbId: match.id,
    title: type === "tv" ? movie.title : details.title || movie.title,
    seriesTitle: type === "tv" ? details.name || lookupTitle : movie.seriesTitle,
    year: (type === "tv" ? details.first_air_date : details.release_date)?.slice(0, 4) || movie.year,
    overview: details.overview || null,
    rating: typeof details.vote_average === "number" ? details.vote_average : null,
    runtimeMinutes: details.runtime || null,
    tagline: details.tagline?.trim() || null,
    certification: type === "movie" ? certification(details) : null,
    collection: details.belongs_to_collection?.name?.replace(/ Collection$/, "") || null,
    genres: details.genres?.map((genre) => genre.name) || movie.genres,
    posterUrl: movie.posterUrl || image(details.poster_path, "w500"),
    backdropUrl: image(details.backdrop_path, "w1280"),
    trailerYouTubeId: trailer?.key || null,
  };
  metadata.isKids = isKidsMovie(metadata.genres || movie.genres, metadata.certification);
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
  return applyKidsOverrides(result);
}
