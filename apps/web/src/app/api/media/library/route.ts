import { buildLibrary } from "@/lib/media/catalog";
import { enrichMovies } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const movies = await enrichMovies(await buildLibrary());
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
