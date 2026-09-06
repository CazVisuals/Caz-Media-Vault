import fs from "node:fs/promises";
import path from "node:path";
import type { Movie } from "./types";

export type KidsOverride = "kids" | "not-kids";
type KidsOverrides = Record<string, KidsOverride>;

function dataFile() {
  const mediaRoot = path.resolve(/* turbopackIgnore: true */ process.env.MEDIA_ROOT?.trim() || "/Volumes/video");
  const appDataRoot = path.resolve(/* turbopackIgnore: true */ process.env.APP_DATA_ROOT?.trim() || path.join(mediaRoot, ".constants-hub"));
  return path.join(appDataRoot, "kids-overrides.json");
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

export function kidsOverrideKey(movie: Movie) {
  if (movie.mediaType === "tv") return `tv:${normalized(movie.seriesTitle || movie.title)}`;
  const parsed = path.parse(movie.relativePath);
  return `movie:${normalized(path.join(parsed.dir, parsed.name))}`;
}

export async function readKidsOverrides(): Promise<KidsOverrides> {
  try {
    const parsed = JSON.parse(await fs.readFile(dataFile(), "utf8")) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, KidsOverride] => entry[1] === "kids" || entry[1] === "not-kids"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function applyKidsOverrides(movies: Movie[]) {
  const overrides = await readKidsOverrides();
  return movies.map((movie) => {
    const override = overrides[kidsOverrideKey(movie)];
    return override ? { ...movie, isKids: override === "kids" } : movie;
  });
}

export async function setKidsOverride(key: string, override: KidsOverride | null) {
  if (!/^(tv|movie):[a-z0-9][a-z0-9 ]*$/u.test(key)) throw new Error("Invalid title selection.");
  const overrides = await readKidsOverrides();
  if (override) overrides[key] = override;
  else delete overrides[key];
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(overrides, null, 2)}\n`);
  await fs.rename(temporary, file);
  return overrides;
}
