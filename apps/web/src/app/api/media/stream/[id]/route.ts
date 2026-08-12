import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { resolveMovie } from "@/lib/media/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm",
  ".mov": "video/quicktime", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
};

function headersFor(filePath: string, size: number) {
  return {
    "Accept-Ranges": "bytes",
    "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": String(size),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

async function locate(id: string) {
  const resolved = await resolveMovie(id);
  if (!resolved) return null;
  const stat = await fsp.stat(resolved.absolutePath);
  return { ...resolved, stat };
}

export async function HEAD(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const resolved = await locate(id);
  if (!resolved) return new Response(null, { status: 404 });
  return new Response(null, { status: 200, headers: headersFor(resolved.absolutePath, resolved.stat.size) });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const resolved = await locate(id);
  if (!resolved) return new Response("Movie not found.", { status: 404 });

  const size = resolved.stat.size;
  const range = request.headers.get("range");
  if (!range) {
    const stream = fs.createReadStream(resolved.absolutePath);
    return new Response(Readable.toWeb(stream) as ReadableStream, { status: 200, headers: headersFor(resolved.absolutePath, size) });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!match[1] && match[2]) {
    const suffix = Number(match[2]);
    start = Math.max(size - suffix, 0);
    end = size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  end = Math.min(end, size - 1);
  const stream = fs.createReadStream(resolved.absolutePath, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 206,
    headers: {
      ...headersFor(resolved.absolutePath, end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${size}`,
    },
  });
}
