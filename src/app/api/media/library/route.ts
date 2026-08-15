import { buildLibrary } from "@/lib/media/catalog";
import { enrichMovies } from "@/lib/tmdb";
import { NextRequest } from "next/server";
import { currentSession } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await currentSession(request);
    const library = await enrichMovies(await buildLibrary());
    const movies = session?.role === "kids" ? library.filter((movie) => movie.isKids) : library;
    return Response.json({
      success: true,
      scannedAt: new Date().toISOString(),
      movieCount: movies.length,
      movies,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Could not build the movie library.",
    }, { status: 500 });
  }
}
