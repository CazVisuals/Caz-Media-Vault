import fs from "node:fs/promises";
import path from "node:path";
import { getMediaRoot } from "./catalog";

const MAX_POSTER_BYTES = 10 * 1024 * 1024;

export async function downloadTmdbPoster(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "image.tmdb.org" || !url.pathname.startsWith("/t/p/")) throw new Error("Invalid poster source.");
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok) throw new Error("Could not download the TMDB poster.");
  const type = response.headers.get("content-type")?.split(";")[0];
  if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") throw new Error("TMDB returned an unsupported poster format.");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_POSTER_BYTES) throw new Error("TMDB poster is too large.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_POSTER_BYTES) throw new Error("TMDB poster is too large.");
  return bytes;
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function findTmdbPoster(title: string, year: string | null) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (!token) return null;
  const url = new URL("https://api.themoviedb.org/3/search/movie");
  url.searchParams.set("query", title);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "en-US");
  if (year) url.searchParams.set("year", year);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const result = await response.json() as { results?: { title?: string; release_date?: string; poster_path?: string | null }[] };
  const wanted = normalized(title);
  const match = result.results?.find((movie) => normalized(movie.title || "") === wanted && (!year || movie.release_date?.startsWith(year)))
    || result.results?.find((movie) => normalized(movie.title || "") === wanted)
    || result.results?.[0];
  return match?.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : null;
}

export async function writePosterPair(directory: string, poster: Uint8Array, overwrite = false) {
  const root = await fs.realpath(/* turbopackIgnore: true */ getMediaRoot());
  const resolved = path.resolve(directory);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Poster destination escapes the media root.");
  await fs.mkdir(resolved, { recursive: true });
  const realDirectory = await fs.realpath(/* turbopackIgnore: true */ resolved);
  const realRelative = path.relative(root, realDirectory);
  if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw new Error("Poster destination escapes the media root.");
  const flag = overwrite ? "w" : "wx";
  let written = 0;
  for (const name of ["poster.jpg", "folder.jpg"]) {
    try {
      await fs.writeFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ realDirectory, name), poster, { flag });
      written += 1;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
  }
  return written;
}
