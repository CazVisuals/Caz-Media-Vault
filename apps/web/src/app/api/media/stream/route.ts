import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const MEDIA_ROOT = "/Volumes/video";

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
};

function resolveMediaPath(requestedPath: string) {
  const root = path.resolve(MEDIA_ROOT);
  const resolved = path.resolve(requestedPath);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Requested media is outside the configured library.");
  }

  return resolved;
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedPath = url.searchParams.get("path");

    if (!requestedPath) {
      return Response.json(
        { success: false, error: "Missing media path." },
        { status: 400 }
      );
    }

    const filePath = resolveMediaPath(requestedPath);
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      return Response.json(
        { success: false, error: "Media file not found." },
        { status: 404 }
      );
    }

    const fileSize = stats.size;
    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] ?? "application/octet-stream";
    const range = request.headers.get("range");

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);

      if (!match) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : fileSize - 1;

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start ||
        start >= fileSize
      ) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }

      const safeEnd = Math.min(end, fileSize - 1);
      const stream = createReadStream(filePath, {
        start,
        end: safeEnd,
      });

      return new Response(
        Readable.toWeb(stream) as ReadableStream<Uint8Array>,
        {
          status: 206,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Length": String(safeEnd - start + 1),
            "Content-Range": `bytes ${start}-${safeEnd}/${fileSize}`,
            "Content-Type": contentType,
            "Cache-Control": "private, no-store",
          },
        }
      );
    }

    const stream = createReadStream(filePath);

    return new Response(
      Readable.toWeb(stream) as ReadableStream<Uint8Array>,
      {
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(fileSize),
          "Content-Type": contentType,
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Could not stream media.";

    return Response.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
