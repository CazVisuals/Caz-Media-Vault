import fs from "node:fs/promises";
import path from "node:path";
import { ensureAppDataRoot } from "@/lib/app-data/path";
import { getMediaRoot } from "@/lib/media/catalog";

const ACTIVE_WINDOW_MS = 2 * 60_000;
const SHARED_PUBLISH_INTERVAL_MS = 10_000;
let lastSharedPublish = 0;
const filePath = async () => path.join(await ensureAppDataRoot(), "last-stream.json");
const sharedFilePath = () => path.join(getMediaRoot(), ".constants-hub", "pc-worker", "streaming.json");

export async function markStreaming(mediaId: string) {
  const now = Date.now();
  const payload = JSON.stringify({ mediaId, at: now });
  const file = await filePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, payload);

  if (now - lastSharedPublish >= SHARED_PUBLISH_INTERVAL_MS) {
    lastSharedPublish = now;
    const shared = sharedFilePath();
    try {
      await fs.mkdir(path.dirname(shared), { recursive: true });
      await fs.writeFile(shared, payload);
    } catch {
      // Playback must never fail just because the worker control marker could not be published.
    }
  }
}

export async function streamingActive() {
  try {
    const value = JSON.parse(await fs.readFile(await filePath(), "utf8")) as { at?: number };
    return typeof value.at === "number" && Date.now() - value.at < ACTIVE_WINDOW_MS;
  } catch { return false; }
}

export function withinConversionSchedule(date = new Date()) {
  if ((process.env.CONVERSION_SCHEDULE_ENABLED ?? "true").toLowerCase() === "false") return true;
  const start = Math.max(0, Math.min(23, Number(process.env.CONVERSION_START_HOUR ?? 0)));
  const end = Math.max(0, Math.min(23, Number(process.env.CONVERSION_END_HOUR ?? 7)));
  const hour = date.getHours();
  return start === end || (start < end ? hour >= start && hour < end : hour >= start || hour < end);
}
