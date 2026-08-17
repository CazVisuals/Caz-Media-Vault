import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { currentSession } from "@/lib/auth/request";
import { resolveMovie } from "@/lib/media/catalog";
import { enqueueConversion } from "@/lib/media/conversion";
import { probeMedia } from "@/lib/media/probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function locate(request: NextRequest, id: string) {
  const resolved = await resolveMovie(id);
  if (!resolved) return { error: new Response("Title not found.", { status: 404 }) };
  const session = await currentSession(request);
  if (session?.role === "kids" && !resolved.movie.isKids) return { error: new Response("This title is unavailable in the Kids profile.", { status: 403 }) };
  const [stat, probe] = await Promise.all([fsp.stat(resolved.absolutePath), probeMedia(resolved.absolutePath)]);
  return { resolved, stat, probe };
}

function transferHeaders(size: number, etag: string, length = size) {
  return { "Accept-Ranges": "bytes", "Content-Type": "video/mp4", "Content-Length": String(length), "Cache-Control": "private, no-store", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "X-Offline-Size": String(size), ETag: etag };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const located = await locate(request, id);
  if ("error" in located) return located.error;
  const { resolved, stat, probe } = located;
  if (!probe.mobileCompatible) return Response.json({ success: false, code: "PREPARATION_REQUIRED", error: "Compatibility preparation is required before this title can be downloaded." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  const etag = `W/\"${stat.size}-${Math.trunc(stat.mtimeMs)}\"`;
  const requested = request.headers.get("range");
  const useRange = requested && (!request.headers.get("if-range") || request.headers.get("if-range") === etag);
  if (!useRange) return new Response(Readable.toWeb(fs.createReadStream(resolved.absolutePath)) as ReadableStream, { status: 200, headers: transferHeaders(stat.size, etag) });
  const match = /^bytes=(\d+)-(\d*)$/u.exec(requested.trim());
  if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
  const start = Number(match[1]); const end = Math.min(match[2] ? Number(match[2]) : stat.size - 1, stat.size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= stat.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
  return new Response(Readable.toWeb(fs.createReadStream(resolved.absolutePath, { start, end })) as ReadableStream, { status: 206, headers: { ...transferHeaders(stat.size, etag, end - start + 1), "Content-Range": `bytes ${start}-${end}/${stat.size}` } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const located = await locate(request, id);
  if ("error" in located) return located.error;
  if (located.probe.mobileCompatible) return Response.json({ success: true, ready: true, job: null });
  const job = await enqueueConversion(located.resolved.movie.relativePath);
  return Response.json({ success: true, ready: false, job }, { status: 202 });
}
