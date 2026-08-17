import fs from "node:fs/promises";
import path from "node:path";
import { buildLibrary, getMediaRoot } from "./catalog";
import { pruneConversionHistory, scanAndQueueConversions } from "./conversion";
import { downloadTmdbPoster, findTmdbPoster, writePosterPair } from "./posters";

let running: Promise<void> | null = null;
const statusPath = () => path.join(getMediaRoot(), ".constants-hub", "maintenance.json");

async function run() {
  const root = await fs.realpath(getMediaRoot());
  const library = await buildLibrary();
  let postersUpdated = 0;
  if (process.env.TMDB_READ_ACCESS_TOKEN) {
    for (const movie of library.filter((item) => !item.posterUrl)) {
      const moviePath = path.resolve(root, movie.relativePath);
      const parent = path.dirname(moviePath);
      const stem = path.basename(movie.fileName, path.extname(movie.fileName));
      const target = path.basename(parent) === stem ? parent : path.join(parent, stem);
      const poster = await downloadTmdbPoster(await findTmdbPoster(movie.title, movie.year));
      if (poster && await writePosterPair(target, poster) > 0) postersUpdated += 1;
    }
  }
  const queued = await scanAndQueueConversions();
  const retainedJobs = await pruneConversionHistory();
  await fs.mkdir(path.dirname(statusPath()), { recursive: true });
  await fs.writeFile(statusPath(), JSON.stringify({ lastRun: new Date().toISOString(), success: true, titlesScanned: library.length, postersUpdated, conversionsQueued: queued.length, retainedJobs }, null, 2));
}

export function scheduleMaintenance() {
  if ((process.env.MAINTENANCE_ENABLED ?? "true").toLowerCase() === "false" || running) return;
  const hour = Math.max(0, Math.min(23, Number(process.env.MAINTENANCE_HOUR ?? 4)));
  if (new Date().getHours() !== hour) return;
  running = (async () => {
    try {
      const current = JSON.parse(await fs.readFile(statusPath(), "utf8")) as { lastRun?: string };
      if (current.lastRun?.slice(0, 10) === new Date().toISOString().slice(0, 10)) return;
    } catch { /* first run */ }
    try { await run(); }
    catch (error) {
      await fs.mkdir(path.dirname(statusPath()), { recursive: true });
      await fs.writeFile(statusPath(), JSON.stringify({ lastRun: new Date().toISOString(), success: false, error: error instanceof Error ? error.message : "Maintenance failed." }, null, 2));
    }
  })().finally(() => { running = null; });
}
