import fs from "node:fs/promises";
import path from "node:path";
import { getMediaRoot } from "@/lib/media/catalog";
import { probeMedia, type MediaProbe } from "@/lib/media/probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const probeCache = new Map<string, { signature: string; probe: MediaProbe }>();

export async function GET(request: Request) {
  try {
    const relative = new URL(request.url).searchParams.get("path")?.trim();
    if (!relative || path.isAbsolute(relative)) return Response.json({ success: false, error: "A relative media path is required." }, { status: 400 });
    const root = await fs.realpath(getMediaRoot());
    const absolute = await fs.realpath(path.resolve(root, relative));
    const inside = path.relative(root, absolute);
    if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) return Response.json({ success: false, error: "Media path escapes the library." }, { status: 403 });
    const stat = await fs.stat(absolute);
    const signature = `${stat.size}:${stat.mtimeMs}`;
    const cached = probeCache.get(absolute);
    const probe = cached?.signature === signature ? cached.probe : await probeMedia(absolute);
    if (!cached || cached.signature !== signature) probeCache.set(absolute, { signature, probe });
    return Response.json({ success: true, path: inside, probe }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Could not inspect media." }, { status: 500 });
  }
}
