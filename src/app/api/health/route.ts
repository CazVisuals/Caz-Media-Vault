import fs from "node:fs/promises";
import { getLibraryCacheStatus, getMediaRoot } from "@/lib/media/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const root = getMediaRoot();
  const started = Date.now();
  try {
    // Health must stay cheap: verify the mounted root only. Never scan, probe,
    // queue conversions, or launch maintenance from the Docker healthcheck.
    await fs.access(root);
    const responseMs = Date.now() - started;
    return Response.json({
      status: responseMs > 1500 ? "degraded" : "ok",
      media: "available",
      mediaRootReadable: true,
      responseMs,
      libraryIndex: getLibraryCacheStatus(),
      tmdbConfigured: Boolean(process.env.TMDB_READ_ACCESS_TOKEN),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      status: "degraded",
      media: "unavailable",
      mediaRootReadable: false,
      responseMs: Date.now() - started,
      libraryIndex: getLibraryCacheStatus(),
      error: error instanceof Error ? error.message : "The configured media root cannot be accessed.",
      tmdbConfigured: Boolean(process.env.TMDB_READ_ACCESS_TOKEN),
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
