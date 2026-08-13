import fs from "node:fs/promises";
import path from "node:path";
import { getMediaRoot } from "@/lib/media/catalog";

export const runtime = "nodejs";
const MAX_POSTER_BYTES = 10 * 1024 * 1024;

function safeRelative(value: unknown) {
  if (typeof value !== "string" || !value.trim() || path.isAbsolute(value)) return null;
  const normalized = path.normalize(value.trim());
  if (normalized === "." || normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) return null;
  return normalized;
}

async function ensureSafeDirectory(root: string, relativeDirectory: string) {
  let current = root;
  for (const segment of relativeDirectory.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Unsafe destination directory.");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") await fs.mkdir(current);
      else throw error;
    }
  }
}

async function downloadPoster(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "image.tmdb.org" || !url.pathname.startsWith("/t/p/")) throw new Error("Invalid poster source.");
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
  if (!response.ok) throw new Error("Could not download the TMDB poster.");
  const type = response.headers.get("content-type")?.split(";")[0];
  if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") throw new Error("TMDB returned an unsupported poster format.");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_POSTER_BYTES) throw new Error("TMDB poster is too large.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_POSTER_BYTES) throw new Error("TMDB poster is too large.");
  return bytes;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { sourceRelativePath?: unknown; destinationRelativePath?: unknown; posterUrl?: unknown };
    const sourceRelative = safeRelative(body.sourceRelativePath);
    const destinationRelative = safeRelative(body.destinationRelativePath);
    if (!sourceRelative || !destinationRelative) return Response.json({ success: false, error: "Safe relative source and destination paths are required." }, { status: 400 });

    const root = await fs.realpath(/* turbopackIgnore: true */ getMediaRoot());
    const inboxConfigured = path.resolve(/* turbopackIgnore: true */ process.env.MEDIA_INBOX?.trim() || path.join(root, "Inbox"));
    const inbox = await fs.realpath(/* turbopackIgnore: true */ inboxConfigured);
    const source = await fs.realpath(/* turbopackIgnore: true */ path.resolve(root, sourceRelative));
    const sourceInsideInbox = path.relative(inbox, source);
    if (!sourceInsideInbox || sourceInsideInbox.startsWith("..") || path.isAbsolute(sourceInsideInbox)) return Response.json({ success: false, error: "Only files inside Inbox can be organized." }, { status: 403 });

    if (destinationRelative.split(path.sep)[0].toLowerCase() === "inbox") return Response.json({ success: false, error: "Destination must be outside Inbox." }, { status: 400 });
    const destination = path.resolve(root, destinationRelative);
    const destinationInsideRoot = path.relative(root, destination);
    if (!destinationInsideRoot || destinationInsideRoot.startsWith("..") || path.isAbsolute(destinationInsideRoot)) return Response.json({ success: false, error: "Destination escapes the media root." }, { status: 400 });

    try {
      await fs.access(destination);
      return Response.json({ success: false, error: "A file already exists at the destination. Nothing was moved." }, { status: 409 });
    } catch {
      // Expected when the proposed destination is available.
    }

    const poster = await downloadPoster(body.posterUrl);
    await ensureSafeDirectory(root, path.dirname(destinationInsideRoot));
    await fs.rename(source, destination);
    if (poster) await fs.writeFile(path.join(path.dirname(destination), "poster.jpg"), poster, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    return Response.json({ success: true, message: poster ? "Movie organized with poster artwork." : "Movie organized successfully.", relativePath: destinationInsideRoot });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Could not organize movie." }, { status: 500 });
  }
}
