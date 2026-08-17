import fs from "node:fs/promises";
import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/request";
import { buildLibrary } from "@/lib/media/catalog";
import { listConversions } from "@/lib/media/conversion";
import { streamingActive, withinConversionSchedule } from "@/lib/media/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await requireOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  const library = await buildLibrary();
  const jobs = await listConversions();
  const shows = new Set(library.filter((item) => item.mediaType === "tv").map((item) => (item.seriesTitle || item.title).toLowerCase()));
  const missingPosters = library.filter((item) => !item.posterUrl).length;
  let maintenance: unknown = null;
  try { maintenance = JSON.parse(await fs.readFile(`${process.env.MEDIA_ROOT || "/media"}/.constants-hub/maintenance.json`, "utf8")); } catch { /* first run */ }
  return Response.json({
    movies: library.filter((item) => item.mediaType === "movie").length,
    shows: shows.size,
    episodes: library.filter((item) => item.mediaType === "tv").length,
    storageBytes: library.reduce((sum, item) => sum + item.size, 0),
    missingPosters,
    recentlyAdded: [...library].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 5).map((item) => item.title),
    conversions: { queued: jobs.filter((item) => item.status === "queued").length, failed: jobs.filter((item) => item.status === "failed").length, completed: jobs.filter((item) => item.status === "completed").length },
    streaming: await streamingActive(), conversionWindowOpen: withinConversionSchedule(), maintenance,
  }, { headers: { "Cache-Control": "no-store" } });
}
