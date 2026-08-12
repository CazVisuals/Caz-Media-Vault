import fs from "node:fs/promises";
import { getMediaRoot } from "@/lib/media/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const root = getMediaRoot();
  try {
    await fs.access(root);
    return Response.json({ status: "ok", media: "available", tmdbConfigured: Boolean(process.env.TMDB_READ_ACCESS_TOKEN) });
  } catch {
    return Response.json({ status: "degraded", media: "unavailable", tmdbConfigured: Boolean(process.env.TMDB_READ_ACCESS_TOKEN) }, { status: 503 });
  }
}
