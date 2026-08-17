import fs from "node:fs/promises";
import path from "node:path";
import { resolveMovie } from "@/lib/media/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asWebVtt(source: string) {
  const normalized = source.replace(/^\uFEFF/u, "").replace(/\r\n?/g, "\n");
  if (normalized.trimStart().startsWith("WEBVTT")) return normalized;
  return `WEBVTT\n\n${normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const resolved = await resolveMovie(id);
  if (!resolved) return new Response("Subtitle not found.", { status: 404 });
  const parsed = path.parse(resolved.absolutePath);
  const candidates = [".vtt", ".srt", ".en.vtt", ".en.srt"].map((extension) => path.join(/* turbopackIgnore: true */ parsed.dir, `${parsed.name}${extension}`));
  for (const candidate of candidates) {
    try {
      const source = await fs.readFile(/* turbopackIgnore: true */ candidate, "utf8");
      return new Response(asWebVtt(source), { headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "private, max-age=300" } });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return new Response("Subtitle could not be read.", { status: 500 });
    }
  }
  return new Response("Subtitle not found.", { status: 404 });
}
