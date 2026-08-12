import { resolveMovie } from "@/lib/media/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const resolved = await resolveMovie(id);
  if (!resolved) return Response.json({ success: false, error: "Movie not found." }, { status: 404 });
  return Response.json({ success: true, movie: resolved.movie }, { headers: { "Cache-Control": "no-store" } });
}
