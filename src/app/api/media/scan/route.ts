import fs from "node:fs/promises";
import path from "node:path";
import { getMediaRoot } from "@/lib/media/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MediaItem = { name: string; type: "folder" | "file"; path: string; relativePath: string; modifiedAt: string | null };

async function scanDirectory(directory: string, root: string): Promise<MediaItem[]> {
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch { return []; }
  const items: MediaItem[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(/* turbopackIgnore: true */ directory, entry.name);
    const relativePath = path.relative(root, fullPath);
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) continue;
    let modifiedAt: string | null = null;
    try { modifiedAt = (await fs.stat(/* turbopackIgnore: true */ fullPath)).mtime.toISOString(); } catch { /* Keep the item with an unknown date. */ }
    if (entry.isDirectory()) {
      items.push({ name: entry.name, type: "folder", path: relativePath, relativePath, modifiedAt });
      items.push(...await scanDirectory(fullPath, root));
    } else if (entry.isFile()) items.push({ name: entry.name, type: "file", path: relativePath, relativePath, modifiedAt });
  }
  return items;
}

export async function GET() {
  const root = getMediaRoot();
  try {
    const items = await scanDirectory(root, root);
    return Response.json({ success: true, root: "configured media root", scannedAt: new Date().toISOString(), items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Could not scan media folder." }, { status: 500 });
  }
}
