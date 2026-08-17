import { resolveMovie } from "@/lib/media/catalog";
import { enrichMovies } from "@/lib/tmdb";
import { NextRequest } from "next/server";
import { currentSession } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const resolved = await resolveMovie(id);
  if (!resolved) return Response.json({ success: false, error: "Movie not found." }, { status: 404 });
  const [movie] = await enrichMovies([resolved.movie]);
  if ((await currentSession(request))?.role === "kids" && !movie.isKids) return Response.json({ success: false, error: "This title is not available in the Kids profile." }, { status: 403 });
  return Response.json({ success: true, movie }, { headers: { "Cache-Control": "no-store" } });
}
