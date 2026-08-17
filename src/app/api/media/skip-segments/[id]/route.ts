import { resolveMovie } from "@/lib/media/catalog";
import { detectSkipSegments } from "@/lib/media/skip-segments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveMovie(id);
  if (!resolved) return Response.json({ error: "Media not found." }, { status: 404 });
  try {
    return Response.json({ segments: await detectSkipSegments(resolved.absolutePath) }, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return Response.json({ segments: [] }, { headers: { "Cache-Control": "private, max-age=300" } });
  }
}
