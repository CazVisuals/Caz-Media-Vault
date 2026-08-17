import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SkipSegment = { type: "recap" | "intro"; title: string; start: number; end: number };

export async function detectSkipSegments(filePath: string): Promise<SkipSegment[]> {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_chapters", "-of", "json", filePath], { timeout: 20_000, maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(stdout) as { chapters?: { start_time?: string; end_time?: string; tags?: Record<string, string> }[] };
  const segments: SkipSegment[] = [];
  for (const chapter of parsed.chapters || []) {
    const title = Object.entries(chapter.tags || {}).find(([key]) => key.toLowerCase() === "title")?.[1]?.trim() || "";
    const normalized = title.toLowerCase();
    const type = /\b(recap|previously|previous episode)\b/u.test(normalized) ? "recap" : /\b(intro|opening|main titles?|title sequence)\b/u.test(normalized) ? "intro" : null;
    const start = Number(chapter.start_time);
    const end = Number(chapter.end_time);
    if (type && Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= 600) segments.push({ type, title, start, end });
  }
  return segments;
}
