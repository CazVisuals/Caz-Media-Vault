import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/request";
import { buildLibrary, invalidateLibraryCache } from "@/lib/media/catalog";
import { kidsOverrideKey, readKidsOverrides, setKidsOverride, type KidsOverride } from "@/lib/media/kids-overrides";
import { enrichMovies } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await requireAdmin(request)) return Response.json({ error: "Admin access required." }, { status: 403 });
  const [movies, overrides] = await Promise.all([enrichMovies(await buildLibrary()), readKidsOverrides()]);
  const titles = new Map<string, { key: string; title: string; mediaType: "movie" | "tv"; year: string | null; isKids: boolean; override: KidsOverride | null; itemCount: number }>();
  for (const movie of movies) {
    const key = kidsOverrideKey(movie);
    const existing = titles.get(key);
    if (existing) { existing.itemCount += 1; continue; }
    titles.set(key, {
      key,
      title: movie.mediaType === "tv" ? movie.seriesTitle || movie.title : movie.title,
      mediaType: movie.mediaType,
      year: movie.year,
      isKids: movie.isKids,
      override: overrides[key] || null,
      itemCount: 1,
    });
  }
  return Response.json({ titles: [...titles.values()].sort((a, b) => a.title.localeCompare(b.title)) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  if (!await requireAdmin(request)) return Response.json({ error: "Admin access required." }, { status: 403 });
  try {
    const body = await request.json() as { key?: string; override?: KidsOverride | "automatic" };
    if (!body.key || !["kids", "not-kids", "automatic"].includes(body.override || "")) throw new Error("Choose Automatic, Kids & Family, or Not Kids.");
    await setKidsOverride(body.key, body.override === "automatic" ? null : body.override as KidsOverride);
    invalidateLibraryCache();
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save category." }, { status: 400 });
  }
}
