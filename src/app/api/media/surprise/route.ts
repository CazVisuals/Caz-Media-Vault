import { NextRequest } from "next/server";
import { currentSession } from "@/lib/auth/request";
import { getProfileState } from "@/lib/app-data/store";
import { buildLibrary } from "@/lib/media/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await currentSession(request);
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  let movies = (await buildLibrary()).filter((item) => item.mediaType === "movie");
  if (session.role === "kids") movies = movies.filter((item) => item.isKids);
  const watched = new Set((await getProfileState(session.profileId)).progress.filter((item) => item.completed).map((item) => item.mediaId));
  const candidates = movies.filter((item) => !watched.has(item.id));
  const pool = candidates.length ? candidates : movies;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return selected ? Response.json({ id: selected.id }) : Response.json({ error: "No movies available." }, { status: 404 });
}
