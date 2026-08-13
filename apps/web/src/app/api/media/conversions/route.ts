import fs from "node:fs/promises";
import path from "node:path";
import { enqueueConversion, listConversions, startConversionWorker } from "@/lib/media/conversion";
import { getMediaRoot } from "@/lib/media/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const VIDEO = new Set([".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"]);

async function mediaFiles(directory: string, root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await mediaFiles(absolute, root));
    else if (entry.isFile() && VIDEO.has(path.extname(entry.name).toLowerCase())) files.push(path.relative(root, absolute));
  }
  return files;
}

export async function GET() { return Response.json({ success: true, jobs: await listConversions() }, { headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  try {
    const body = await request.json() as { source?: unknown; scan?: unknown };
    const queued = [];
    if (body.scan === true) {
      const root = await fs.realpath(getMediaRoot());
      for (const relative of await mediaFiles(root, root)) { const job = await enqueueConversion(relative, false); if (job) queued.push(job); }
      startConversionWorker();
    } else if (typeof body.source === "string") { const job = await enqueueConversion(body.source); if (job) queued.push(job); }
    else return Response.json({ success: false, error: "A source or Inbox scan is required." }, { status: 400 });
    return Response.json({ success: true, queued, jobs: await listConversions() });
  } catch (error) { return Response.json({ success: false, error: error instanceof Error ? error.message : "Could not queue conversion." }, { status: 500 }); }
}
