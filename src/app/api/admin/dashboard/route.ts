import fs from "node:fs/promises";
import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/request";
import { buildLibrary } from "@/lib/media/catalog";
import { listConversions } from "@/lib/media/conversion";
import { streamingActive, withinConversionSchedule } from "@/lib/media/activity";
import { ensureAppDataRoot } from "@/lib/app-data/path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await requireOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  const library = await buildLibrary();
  const jobs = await listConversions();
  const shows = new Set(library.filter((item) => item.mediaType === "tv").map((item) => (item.seriesTitle || item.title).toLowerCase()));
  const missingPosters = library.filter((item) => !item.posterUrl).length;
  let maintenance: unknown = null;
  try { maintenance = JSON.parse(await fs.readFile(`${await ensureAppDataRoot()}/maintenance.json`, "utf8")); } catch { /* first run */ }
  const alerts = [
    ...(missingPosters ? [{ level: "warning", title: `${missingPosters} title${missingPosters === 1 ? "" : "s"} missing artwork`, action: "/settings#posters" }] : []),
    ...(jobs.some((item) => item.status === "failed") ? [{ level: "error", title: `${jobs.filter((item) => item.status === "failed").length} conversion job${jobs.filter((item) => item.status === "failed").length === 1 ? "" : "s"} failed`, action: "/settings/media" }] : []),
    ...(maintenance && typeof maintenance === "object" && "success" in maintenance && maintenance.success === false ? [{ level: "error", title: "Automatic maintenance failed", action: "/settings" }] : []),
  ];
  return Response.json({
    movies: library.filter((item) => item.mediaType === "movie").length,
    shows: shows.size,
    episodes: library.filter((item) => item.mediaType === "tv").length,
    storageBytes: library.reduce((sum, item) => sum + item.size, 0),
    missingPosters,
    recentlyAdded: [...library].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 5).map((item) => item.title),
    conversions: { queued: jobs.filter((item) => item.status === "queued").length, failed: jobs.filter((item) => item.status === "failed").length, completed: jobs.filter((item) => item.status === "completed").length },
    streaming: await streamingActive(), conversionWindowOpen: withinConversionSchedule(), maintenance, alerts,
  }, { headers: { "Cache-Control": "no-store" } });
}
