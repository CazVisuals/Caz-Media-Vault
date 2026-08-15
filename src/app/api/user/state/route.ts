import { NextRequest } from "next/server";
import { currentSession } from "@/lib/auth/request";
import { clearProgress, getProfileState, saveProgress, setWatchlist } from "@/lib/app-data/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await currentSession(request);
  if (!session) return Response.json({ authenticated: false, progress: [], watchlist: [] }, { headers: { "Cache-Control": "no-store" } });
  return Response.json({ authenticated: true, ...await getProfileState(session.profileId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await currentSession(request);
  if (!session) return Response.json({ error: "Sign in to synchronize this device." }, { status: 401 });
  try {
    const body = await request.json() as { action?: string; mediaId?: string; seconds?: number; duration?: number; included?: boolean };
    if (!body.mediaId) throw new Error("Media ID is required.");
    if (body.action === "progress") return Response.json({ success: true, progress: await saveProgress(session.profileId, body.mediaId, Number(body.seconds), Number(body.duration)) });
    if (body.action === "clear-progress") return Response.json({ success: true, cleared: await clearProgress(session.profileId, body.mediaId) });
    if (body.action === "watchlist") return Response.json({ success: true, watchlist: await setWatchlist(session.profileId, body.mediaId, Boolean(body.included)) });
    throw new Error("Unknown profile-state action.");
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not update profile." }, { status: 400 }); }
}
