import fs from "node:fs/promises";
import path from "node:path";
import { resolveArtwork } from "@/lib/media/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const artwork = await resolveArtwork(id);
  if (!artwork) return new Response("Artwork not found.", { status: 404 });
  const body = await fs.readFile(artwork);
  return new Response(body, {
    headers: {
      "Content-Type": MIME[path.extname(artwork).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
