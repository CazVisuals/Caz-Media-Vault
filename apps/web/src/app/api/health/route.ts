import fs from "node:fs/promises";
import { getMediaRoot } from "@/lib/media/catalog";
import { scheduleAutomaticConversionScan } from "@/lib/media/conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const root = getMediaRoot();
  try {
    const entries = await fs.readdir(root);
    scheduleAutomaticConversionScan();
    return Response.json({
      status: "ok",
      media: "available",
      mediaRootReadable: true,
      rootEntryCount: entries.length,
      tmdbConfigured: Boolean(process.env.TMDB_READ_ACCESS_TOKEN),
    });
  } catch (error) {
    return Response.json({
      status: "degraded",
      media: "unavailable",
      mediaRootReadable: false,
      error: error instanceof Error ? error.message : "The configured media root cannot be read.",
      tmdbConfigured: Boolean(process.env.TMDB_READ_ACCESS_TOKEN),
    }, { status: 503 });
  }
}
