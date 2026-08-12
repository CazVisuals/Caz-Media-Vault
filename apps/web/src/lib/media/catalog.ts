import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Movie } from "./types";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"]);
const ARTWORK_NAMES = ["poster.jpg", "poster.jpeg", "poster.png", "folder.jpg", "folder.jpeg", "folder.png"];

export function getMediaRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.MEDIA_ROOT?.trim() || "/Volumes/video");
}

function movieId(relativePath: string) {
  return createHash("sha256").update(relativePath).digest("hex").slice(0, 24);
}

function parseName(fileName: string) {
  const stem = path.basename(fileName, path.extname(fileName));
  const match = stem.match(/\((19|20)\d{2}\)/);
  const year = match?.[0].slice(1, -1) ?? null;
  const title = stem
    .replace(/\((19|20)\d{2}\)/, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || stem;
  return { stem, title, year };
}

async function findArtwork(filePath: string, stem: string) {
  const parent = path.dirname(filePath);
  const directories = [parent, path.join(parent, stem)];
  for (const directory of directories) {
    for (const name of ARTWORK_NAMES) {
      const candidate = path.join(/* turbopackIgnore: true */ directory, name);
      try {
        const stat = await fs.stat(/* turbopackIgnore: true */ candidate);
        if (stat.isFile()) return candidate;
      } catch {
        // Local artwork is optional.
      }
    }
  }
  return null;
}

async function walk(directory: string, root: string, files: string[]) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
    if (relative.split(path.sep)[0].toLowerCase() === "inbox") continue;
    if (entry.isDirectory()) await walk(absolute, root, files);
    else if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
  }
}

export async function buildLibrary(): Promise<Movie[]> {
  const root = getMediaRoot();
  const files: string[] = [];
  await walk(root, root, files);

  const movies = await Promise.all(files.map(async (filePath) => {
    const relativePath = path.relative(root, filePath);
    const stat = await fs.stat(filePath);
    const parsed = parseName(path.basename(filePath));
    const localArtwork = await findArtwork(filePath, parsed.stem);
    const topLevel = relativePath.split(path.sep)[0];
    const genre = topLevel && topLevel !== path.basename(filePath) ? topLevel : null;
    const id = movieId(relativePath);

    return {
      id,
      title: parsed.title,
      year: parsed.year,
      fileName: path.basename(filePath),
      relativePath,
      modifiedAt: stat.mtime.toISOString(),
      size: stat.size,
      genre,
      genres: genre ? [genre] : [],
      overview: null,
      rating: null,
      posterUrl: localArtwork ? `/api/media/artwork/${id}` : null,
      backdropUrl: null,
    } satisfies Movie;
  }));

  return movies.sort((a, b) => a.title.localeCompare(b.title));
}

export async function resolveMovie(id: string) {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const movie = (await buildLibrary()).find((item) => item.id === id);
  if (!movie) return null;
  const absolutePath = path.resolve(getMediaRoot(), movie.relativePath);
  const relative = path.relative(getMediaRoot(), absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  const realRoot = await fs.realpath(/* turbopackIgnore: true */ getMediaRoot());
  const realPath = await fs.realpath(/* turbopackIgnore: true */ absolutePath);
  const realRelative = path.relative(realRoot, realPath);
  if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) return null;
  return { movie, absolutePath: realPath };
}

export async function resolveArtwork(id: string) {
  const resolved = await resolveMovie(id);
  if (!resolved) return null;
  const { stem } = parseName(resolved.movie.fileName);
  const artwork = await findArtwork(resolved.absolutePath, stem);
  if (!artwork) return null;
  const realRoot = await fs.realpath(/* turbopackIgnore: true */ getMediaRoot());
  const realArtwork = await fs.realpath(/* turbopackIgnore: true */ artwork);
  const relative = path.relative(realRoot, realArtwork);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return realArtwork;
}
