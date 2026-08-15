import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getMediaRoot } from "./catalog";
import { probeMedia } from "./probe";

export type ConversionJob = { id: string; source: string; output: string; status: "queued" | "converting" | "completed" | "failed"; progress?: number; durationSeconds?: number | null; error: string | null; createdAt: string; updatedAt: string };
const STORE_DIR = ".constants-hub";
const STORE_FILE = "conversion-queue.json";
const PAUSE_FILE = "conversion-paused";
let worker: Promise<void> | null = null;
let currentFfmpeg: ChildProcess | null = null;
let autoScan: Promise<void> | null = null;
let lastAutoScan = 0;
const VIDEO = new Set([".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"]);

async function paths() {
  const root = await fs.realpath(getMediaRoot());
  const inbox = await fs.realpath(/* turbopackIgnore: true */ path.resolve(/* turbopackIgnore: true */ process.env.MEDIA_INBOX?.trim() || path.join(root, "Inbox")));
  const inside = path.relative(root, inbox);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) throw new Error("MEDIA_INBOX must be inside MEDIA_ROOT.");
  const store = path.join(root, STORE_DIR);
  await fs.mkdir(store, { recursive: true });
  return { root, inbox, store, file: path.join(store, STORE_FILE) };
}

async function readJobs(): Promise<ConversionJob[]> {
  const { file } = await paths();
  try { return JSON.parse(await fs.readFile(/* turbopackIgnore: true */ file, "utf8")) as ConversionJob[]; } catch { return []; }
}
async function writeJobs(jobs: ConversionJob[]) { const { file } = await paths(); await fs.writeFile(`${file}.tmp`, JSON.stringify(jobs, null, 2)); await fs.rename(`${file}.tmp`, file); }
async function update(id: string, patch: Partial<ConversionJob>) { const jobs = await readJobs(); const job = jobs.find((item) => item.id === id); if (job) Object.assign(job, patch, { updatedAt: new Date().toISOString() }); await writeJobs(jobs); }

function runFfmpeg(args: string[], jobId: string, durationSeconds: number | null) {
  return new Promise<void>((resolve, reject) => {
    const output = args.at(-1);
    if (!output) { reject(new Error("FFmpeg output is missing.")); return; }
    const child = spawn("ffmpeg", [...args.slice(0, -1), "-progress", "pipe:1", "-nostats", output], { stdio: ["ignore", "pipe", "pipe"] });
    currentFfmpeg = child;
    let progressBuffer = "";
    let lastProgressWrite = 0;
    child.stdout?.on("data", (chunk) => {
      progressBuffer += String(chunk);
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("out_time_us=") || !durationSeconds) continue;
        const seconds = Number(line.slice("out_time_us=".length)) / 1_000_000;
        const progress = Math.max(0, Math.min(99, Math.round((seconds / durationSeconds) * 100)));
        if (Date.now() - lastProgressWrite > 1500) { lastProgressWrite = Date.now(); void update(jobId, { progress, durationSeconds }); }
      }
    });
    let error = ""; child.stderr.on("data", (chunk) => { error = `${error}${chunk}`.slice(-8000); });
    child.on("error", (reason) => { currentFfmpeg = null; reject(reason); });
    child.on("exit", (code) => { currentFfmpeg = null; if (code === 0) resolve(); else reject(new Error(error.trim() || `FFmpeg exited with code ${code}.`)); });
  });
}

async function pausePath() { return path.join((await paths()).store, PAUSE_FILE); }
export async function conversionsPaused() { try { await fs.access(await pausePath()); return true; } catch { return false; } }

export async function pauseConversions() {
  await fs.writeFile(await pausePath(), new Date().toISOString());
  if (currentFfmpeg && !currentFfmpeg.killed) currentFfmpeg.kill("SIGSTOP");
  return true;
}

export async function resumeConversions() {
  await fs.rm(await pausePath(), { force: true });
  if (currentFfmpeg && !currentFfmpeg.killed) currentFfmpeg.kill("SIGCONT");
  startConversionWorker();
  return false;
}

export async function clearConversions(mode: "failed" | "finished") {
  const jobs = await readJobs();
  const kept = jobs.filter((job) => mode === "failed" ? job.status !== "failed" : !["failed", "completed"].includes(job.status));
  await writeJobs(kept);
  return kept;
}

async function processJob(job: ConversionJob) {
  const { root } = await paths();
  const source = await fs.realpath(path.resolve(root, job.source));
  const inside = path.relative(root, source);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside) || inside.split(path.sep).some((part) => part.startsWith("."))) throw new Error("Conversion source must remain inside the media library.");
  const output = path.resolve(root, job.output);
  const outputInside = path.relative(root, output);
  if (!outputInside || outputInside.startsWith("..") || path.isAbsolute(outputInside)) throw new Error("Conversion output escapes the media library.");
  const tempDir = path.join(root, STORE_DIR, "converting");
  const originals = path.join(root, STORE_DIR, "originals", path.dirname(inside));
  await fs.mkdir(tempDir, { recursive: true }); await fs.mkdir(originals, { recursive: true });
  const temp = path.join(tempDir, `${job.id}.mp4`);
  await fs.rm(temp, { force: true });
  const sourceProbe = await probeMedia(source);
  await update(job.id, { progress: 0, durationSeconds: sourceProbe.durationSeconds });
  await runFfmpeg(["-hide_banner", "-y", "-i", source, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads:v", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", temp], job.id, sourceProbe.durationSeconds);
  const verified = await probeMedia(temp); if (!verified.mobileCompatible) throw new Error("Converted file failed mobile compatibility verification.");
  let archived = path.join(originals, path.basename(source));
  try { await fs.access(archived); archived = path.join(originals, `${job.id}-${path.basename(source)}`); } catch { /* available */ }
  await fs.rename(source, archived);
  try { await fs.rename(temp, output); } catch (error) { await fs.rename(archived, source).catch(() => undefined); throw error; }
}

async function work() {
  for (;;) {
    if (await conversionsPaused()) return;
    const jobs = await readJobs(); const job = jobs.find((item) => item.status === "queued" || item.status === "converting"); if (!job) return;
    await update(job.id, { status: "converting", error: null });
    try { await processJob(job); await update(job.id, { status: "completed", progress: 100 }); } catch (error) { await update(job.id, { status: "failed", error: error instanceof Error ? error.message : "Conversion failed." }); }
  }
}

export async function listConversions() { const jobs = await readJobs(); if (!worker && !(await conversionsPaused()) && jobs.some((job) => job.status === "queued" || job.status === "converting")) { worker = work().finally(() => { worker = null; }); } return jobs; }

export function startConversionWorker() { if (!worker) worker = work().finally(() => { worker = null; }); }

export async function enqueueConversion(relativePath: string, start = true) {
  const { root } = await paths(); const source = await fs.realpath(path.resolve(root, relativePath)); const inside = path.relative(root, source);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside) || inside.split(path.sep).some((part) => part.startsWith("."))) throw new Error("Conversion source must remain inside the media library.");
  const probe = await probeMedia(source); if (probe.mobileCompatible) return null;
  const jobs = await readJobs(); const existing = jobs.find((job) => job.source === inside); if (existing) return existing;
  const parsed = path.parse(inside); const output = path.join(parsed.dir, `${parsed.name}.mp4`); const now = new Date().toISOString();
  const job: ConversionJob = { id: createHash("sha256").update(`${inside}:${now}`).digest("hex").slice(0, 16), source: inside, output, status: "queued", progress: 0, durationSeconds: probe.durationSeconds, error: null, createdAt: now, updatedAt: now };
  jobs.push(job); await writeJobs(jobs); if (start && !(await conversionsPaused())) startConversionWorker(); return job;
}

async function mediaFiles(directory: string, root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await mediaFiles(absolute, root));
    else if (entry.isFile() && VIDEO.has(path.extname(entry.name).toLowerCase())) files.push(path.relative(root, absolute));
  }
  return files;
}

export async function scanAndQueueConversions() {
  const root = await fs.realpath(getMediaRoot());
  const queued: ConversionJob[] = [];
  for (const relative of await mediaFiles(root, root)) {
    const job = await enqueueConversion(relative, false);
    if (job?.status === "queued") queued.push(job);
  }
  if (!(await conversionsPaused())) startConversionWorker();
  return queued;
}

export function scheduleAutomaticConversionScan() {
  const now = Date.now();
  if (autoScan || now - lastAutoScan < 60_000) return;
  lastAutoScan = now;
  autoScan = scanAndQueueConversions().then(() => undefined).catch(() => undefined).finally(() => { autoScan = null; });
}
