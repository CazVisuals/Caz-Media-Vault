import { buildLibrary } from "@/lib/media/catalog";
import { enrichMovies } from "@/lib/tmdb";
import type { Movie } from "@/lib/media/types";
import { NextRequest } from "next/server";
import { currentSession } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let lastGoodLibrary: Movie[] = [];
let lastGoodScannedAt = "";

export async function GET(request: NextRequest) {
  const session = await currentSession(request);
  try {
    const library = await enrichMovies(await buildLibrary());
    lastGoodLibrary = library;
    lastGoodScannedAt = new Date().toISOString();
    const movies = session?.role === "kids" ? library.filter((movie) => movie.isKids) : library;
    return Response.json({
      success: true,
      scannedAt: lastGoodScannedAt,
      movieCount: movies.length,
      movies,
      stale: false,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (lastGoodLibrary.length) {
      const movies = session?.role === "kids" ? lastGoodLibrary.filter((movie) => movie.isKids) : lastGoodLibrary;
      return Response.json({
        success: true,
        scannedAt: lastGoodScannedAt || new Date().toISOString(),
        movieCount: movies.length,
        movies,
        stale: true,
        warning: error instanceof Error ? error.message : "NAS scan temporarily unavailable; showing last known-good library.",
      }, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Could not build the movie library.",
    }, { status: 500 });
  }
}
