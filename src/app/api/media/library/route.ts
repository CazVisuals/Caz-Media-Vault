import fs from "node:fs/promises";
import path from "node:path";
import { buildLibrary } from "@/lib/media/catalog";
import { enrichMovies } from "@/lib/tmdb";
import type { Movie } from "@/lib/media/types";
import { ensureAppDataRoot } from "@/lib/app-data/path";
import { NextRequest } from "next/server";
import { currentSession } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNAPSHOT_FILE = "library-snapshot.json";
const BACKGROUND_REFRESH_MS = 5 * 60 * 1000;
type Snapshot = { scannedAt: string; movies: Movie[] };

let memorySnapshot: Snapshot | null = null;
let refreshInFlight: Promise<Snapshot> | null = null;

async function snapshotPath() {
  return path.join(await ensureAppDataRoot(), SNAPSHOT_FILE);
}

async function readSnapshot(): Promise<Snapshot | null> {
  if (memorySnapshot?.movies.length) return memorySnapshot;
  try {
    const parsed = JSON.parse(await fs.readFile(await snapshotPath(), "utf8")) as Snapshot;
    if (!Array.isArray(parsed.movies) || !parsed.scannedAt) return null;
    memorySnapshot = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function writeSnapshot(snapshot: Snapshot) {
  memorySnapshot = snapshot;
  const file = await snapshotPath();
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(snapshot));
  await fs.rename(temp, file);
}

function refreshSnapshot() {
  refreshInFlight ??= (async () => {
    const movies = await enrichMovies(await buildLibrary());
    const snapshot = { scannedAt: new Date().toISOString(), movies } satisfies Snapshot;
    await writeSnapshot(snapshot);
    return snapshot;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

function responseFor(snapshot: Snapshot, kids: boolean, stale: boolean, warning?: string) {
  const movies = kids ? snapshot.movies.filter((movie) => movie.isKids) : snapshot.movies;
  return Response.json({
    success: true,
    scannedAt: snapshot.scannedAt,
    movieCount: movies.length,
    movies,
    stale,
    ...(warning ? { warning } : {}),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const session = await currentSession(request);
  const kids = session?.role === "kids";
  const forceRefresh = ["1", "true"].includes(request.nextUrl.searchParams.get("refresh")?.toLowerCase() || "");
  const existing = await readSnapshot();

  if (!forceRefresh && existing) {
    const age = Date.now() - Date.parse(existing.scannedAt);
    if (!Number.isFinite(age) || age >= BACKGROUND_REFRESH_MS) void refreshSnapshot().catch(() => undefined);
    return responseFor(existing, kids, age >= BACKGROUND_REFRESH_MS);
  }

  try {
    const fresh = await refreshSnapshot();
    return responseFor(fresh, kids, false);
  } catch (error) {
    const fallback = existing || await readSnapshot();
    if (fallback) {
      return responseFor(
        fallback,
        kids,
        true,
        error instanceof Error ? error.message : "NAS refresh temporarily unavailable; showing the saved library.",
      );
    }
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Could not build the movie library.",
    }, { status: 500 });
  }
}
