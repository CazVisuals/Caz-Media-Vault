import { resolveMovie } from "@/lib/media/catalog";
import { enrichMovies } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const resolved = await resolveMovie(id);
  if (!resolved) return Response.json({ success: false, error: "Movie not found." }, { status: 404 });
  const [movie] = await enrichMovies([resolved.movie]);
  return Response.json({ success: true, movie }, { headers: { "Cache-Control": "no-store" } });
}
