import fs from "node:fs/promises";
import path from "node:path";
import { ensureAppDataRoot } from "@/lib/app-data/path";

const ACTIVE_WINDOW_MS = 2 * 60_000;
const filePath = async () => path.join(await ensureAppDataRoot(), "last-stream.json");

export async function markStreaming(mediaId: string) {
  const file = await filePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ mediaId, at: Date.now() }));
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
