import fs from "node:fs/promises";
import path from "node:path";
import { buildLibrary, getMediaRoot } from "@/lib/media/catalog";
import { downloadTmdbPoster, findTmdbPoster, writePosterPair } from "@/lib/media/posters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const root = await fs.realpath(/* turbopackIgnore: true */ getMediaRoot());
    const movies = await buildLibrary();
    let moviesUpdated = 0;
    let filesWritten = 0;
    let unavailable = 0;

    for (const movie of movies) {
      const moviePath = path.resolve(root, movie.relativePath);
      const parent = path.dirname(moviePath);
      const stem = path.basename(movie.fileName, path.extname(movie.fileName));
      const target = path.basename(parent) === stem ? parent : path.join(parent, stem);
      const missing = await Promise.all(["poster.jpg", "folder.jpg"].map(async (name) => {
        try { return !(await fs.stat(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ target, name))).isFile(); } catch { return true; }
      }));
      if (!missing.some(Boolean)) continue;

      const posterUrl = await findTmdbPoster(movie.title, movie.year);
      const poster = await downloadTmdbPoster(posterUrl);
      if (!poster) { unavailable += 1; continue; }
      const written = await writePosterPair(target, poster);
      if (written > 0) { moviesUpdated += 1; filesWritten += written; }
    }

    return Response.json({
      success: true,
      moviesUpdated,
      filesWritten,
      unavailable,
      message: `Updated artwork for ${moviesUpdated} movie${moviesUpdated === 1 ? "" : "s"}. Re-index Synology Media Server to refresh Samsung TV thumbnails.`,
    });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Could not sync movie posters." }, { status: 500 });
  }
}
