import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Movie } from "./types";
import { isKidsMovie } from "./kids";
import { parseEpisodeName } from "./episodes";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"]);
const ARTWORK_NAMES = ["poster.jpg", "poster.jpeg", "poster.png", "folder.jpg", "folder.jpeg", "folder.png"];
const LIBRARY_CACHE_TTL_MS = Math.max(15_000, Number(process.env.LIBRARY_CACHE_TTL_MS || 60_000));

type LibraryCache = { movies: Movie[]; scannedAt: number };
let libraryCache: LibraryCache | null = null;
let libraryBuild: Promise<Movie[]> | null = null;

export function getMediaRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.MEDIA_ROOT?.trim() || "/Volumes/video");
}

export function getLibraryCacheStatus() {
  return libraryCache ? { available: true, scannedAt: new Date(libraryCache.scannedAt).toISOString(), movieCount: libraryCache.movies.length } : { available: false, scannedAt: null, movieCount: 0 };
}

export function invalidateLibraryCache() {
  libraryCache = null;
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
        // Local artwork is optional and files may move during conversion.
      }
    }
  }
  return null;
}

async function walk(directory: string, root: string, files: string[]) {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (directory !== root) return;
    const relative = path.relative(root, directory) || ".";
    const reason = error instanceof Error ? error.message : "Unknown filesystem error";
    throw new Error(`Cannot read media directory "${relative}": ${reason}`);
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

async function buildMovie(root: string, filePath: string): Promise<Movie | null> {
  try {
    const relativePath = path.relative(root, filePath);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
    const parsed = parseName(path.basename(filePath));
    const episode = parseEpisodeName(path.basename(filePath));
    const localArtwork = await findArtwork(filePath, parsed.stem);
    const topLevel = relativePath.split(path.sep)[0];
    const isTvPath = topLevel?.toLowerCase() === "tv shows";
    const genre = isTvPath ? "TV Shows" : topLevel && topLevel !== path.basename(filePath) ? topLevel : null;
    const id = movieId(relativePath);

    return {
      id,
      title: episode ? `${episode.seriesTitle} · ${String(episode.seasonNumber).padStart(2, "0")}x${String(episode.episodeNumber).padStart(2, "0")}` : parsed.title,
      year: parsed.year,
      fileName: path.basename(filePath),
      relativePath,
      modifiedAt: stat.mtime.toISOString(),
      size: stat.size,
      genre,
      genres: genre ? [genre] : [],
      isKids: isKidsMovie(genre ? [genre] : [], null),
      mediaType: episode || isTvPath ? "tv" : "movie",
      seriesTitle: episode?.seriesTitle || (isTvPath ? relativePath.split(path.sep)[1] || null : null),
      seasonNumber: episode?.seasonNumber ?? null,
      episodeNumber: episode?.episodeNumber ?? null,
      overview: null,
      rating: null,
      runtimeMinutes: null,
      tmdbId: null,
      tagline: null,
      certification: null,
      collection: null,
      posterUrl: localArtwork ? `/api/media/artwork/${id}` : null,
      backdropUrl: null,
      trailerYouTubeId: null,
    } satisfies Movie;
  } catch {
    // A converter may replace/archive a file between readdir and stat.
    return null;
  }
}

async function scanLibrary(): Promise<Movie[]> {
  const root = getMediaRoot();
  const files: string[] = [];
  await walk(root, root, files);
  const results = await Promise.all(files.map((filePath) => buildMovie(root, filePath)));
  return results.filter((movie): movie is Movie => Boolean(movie)).sort((a, b) => a.title.localeCompare(b.title));
}

export async function buildLibrary(options: { force?: boolean } = {}): Promise<Movie[]> {
  const now = Date.now();
  if (!options.force && libraryCache && now - libraryCache.scannedAt < LIBRARY_CACHE_TTL_MS) return libraryCache.movies;
  if (libraryBuild) return libraryBuild;

  libraryBuild = scanLibrary()
    .then((movies) => {
      libraryCache = { movies, scannedAt: Date.now() };
      return movies;
    })
    .catch((error) => {
      // Keep pages alive during short NAS stalls when a known-good index exists.
      if (libraryCache) return libraryCache.movies;
      throw error;
    })
    .finally(() => { libraryBuild = null; });
  return libraryBuild;
}

export async function resolveMovie(id: string) {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  let movie = (await buildLibrary()).find((item) => item.id === id);
  // A conversion changes the extension (and therefore ID). Only rescan on an actual cache miss.
  if (!movie) movie = (await buildLibrary({ force: true })).find((item) => item.id === id);
  if (!movie) return null;
  const absolutePath = path.resolve(getMediaRoot(), movie.relativePath);
  const relative = path.relative(getMediaRoot(), absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  try {
    const realRoot = await fs.realpath(/* turbopackIgnore: true */ getMediaRoot());
    const realPath = await fs.realpath(/* turbopackIgnore: true */ absolutePath);
    const realRelative = path.relative(realRoot, realPath);
    if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) return null;
    return { movie, absolutePath: realPath };
  } catch {
    return null;
  }
}

export async function resolveArtwork(id: string) {
  const resolved = await resolveMovie(id);
  if (!resolved) return null;
  const { stem } = parseName(resolved.movie.fileName);
  const artwork = await findArtwork(resolved.absolutePath, stem);
  if (!artwork) return null;
  try {
    const realRoot = await fs.realpath(/* turbopackIgnore: true */ getMediaRoot());
    const realArtwork = await fs.realpath(/* turbopackIgnore: true */ artwork);
    const relative = path.relative(realRoot, realArtwork);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return realArtwork;
  } catch {
    return null;
  }
}
