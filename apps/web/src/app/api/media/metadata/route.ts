import { NextRequest } from "next/server";
import { isKidsMovie } from "@/lib/media/kids";

type TmdbGenre = { id: number; name: string };
type TmdbMovie = { id: number; title: string; release_date?: string; overview?: string; poster_path?: string | null; vote_average?: number; genre_ids?: number[] };
type TmdbDetails = TmdbMovie & { genres?: TmdbGenre[]; release_dates?: { results?: { iso_3166_1?: string; release_dates?: { certification?: string; type?: number }[] }[] } };

function certification(details: TmdbDetails) {
  const releases = details.release_dates?.results?.find((result) => result.iso_3166_1 === "US")?.release_dates || [];
  return releases.find((release) => release.certification && release.type === 3)?.certification
    || releases.find((release) => release.certification)?.certification
    || null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
    if (!token) throw new Error("TMDB_READ_ACCESS_TOKEN is missing.");
    const title = request.nextUrl.searchParams.get("title")?.trim();
    const year = request.nextUrl.searchParams.get("year")?.trim();
    if (!title) return Response.json({ success: false, error: "Movie title is required." }, { status: 400 });

    const searchUrl = new URL("https://api.themoviedb.org/3/search/movie");
    searchUrl.searchParams.set("query", title);
    searchUrl.searchParams.set("include_adult", "false");
    searchUrl.searchParams.set("language", "en-US");
    if (year) searchUrl.searchParams.set("year", year);
    const headers = { Authorization: `Bearer ${token}`, accept: "application/json" };
    const [moviesResponse, genresResponse] = await Promise.all([
      fetch(searchUrl, { headers, signal: AbortSignal.timeout(8000) }),
      fetch("https://api.themoviedb.org/3/genre/movie/list?language=en-US", { headers, signal: AbortSignal.timeout(8000) }),
    ]);
    if (!moviesResponse.ok || !genresResponse.ok) throw new Error("TMDB request failed.");
    const movies = await moviesResponse.json() as { results?: TmdbMovie[] };
    const genres = await genresResponse.json() as { genres?: TmdbGenre[] };
    const movie = movies.results?.[0];
    if (!movie) return Response.json({ success: true, movie: null });
    const detailsResponse = await fetch(`https://api.themoviedb.org/3/movie/${movie.id}?language=en-US&append_to_response=release_dates`, { headers, signal: AbortSignal.timeout(8000) });
    const details: TmdbDetails = detailsResponse.ok ? await detailsResponse.json() as TmdbDetails : movie;
    const names = details.genres?.map((genre) => genre.name)
      || (movie.genre_ids || []).map((id) => genres.genres?.find((genre) => genre.id === id)?.name).filter((name): name is string => Boolean(name));
    const rating = certification(details);
    return Response.json({ success: true, movie: {
      id: movie.id,
      title: movie.title,
      year: movie.release_date?.slice(0, 4) || null,
      overview: movie.overview || null,
      rating: movie.vote_average ?? null,
      posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      genres: names,
      certification: rating,
      isKids: isKidsMovie(names, rating),
    } });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Could not load movie metadata." }, { status: 500 });
  }
}
