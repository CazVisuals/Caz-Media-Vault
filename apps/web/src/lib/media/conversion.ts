import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getMediaRoot } from "./catalog";
import { probeMedia } from "./probe";

export type ConversionJob = { id: string; source: string; output: string; status: "queued" | "converting" | "completed" | "failed"; error: string | null; createdAt: string; updatedAt: string };
const STORE_DIR = ".constants-hub";
const STORE_FILE = "conversion-queue.json";
let worker: Promise<void> | null = null;

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

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let error = ""; child.stderr.on("data", (chunk) => { error = `${error}${chunk}`.slice(-8000); });
    child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(error.trim() || `FFmpeg exited with code ${code}.`)));
  });
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
  await runFfmpeg(["-hide_banner", "-y", "-i", source, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", temp]);
  const verified = await probeMedia(temp); if (!verified.mobileCompatible) throw new Error("Converted file failed mobile compatibility verification.");
  let archived = path.join(originals, path.basename(source));
  try { await fs.access(archived); archived = path.join(originals, `${job.id}-${path.basename(source)}`); } catch { /* available */ }
  await fs.rename(source, archived);
  try { await fs.rename(temp, output); } catch (error) { await fs.rename(archived, source).catch(() => undefined); throw error; }
}

async function work() {
  for (;;) {
    const jobs = await readJobs(); const job = jobs.find((item) => item.status === "queued" || item.status === "converting"); if (!job) return;
    await update(job.id, { status: "converting", error: null });
    try { await processJob(job); await update(job.id, { status: "completed" }); } catch (error) { await update(job.id, { status: "failed", error: error instanceof Error ? error.message : "Conversion failed." }); }
  }
}

export async function listConversions() { const jobs = await readJobs(); if (!worker && jobs.some((job) => job.status === "queued" || job.status === "converting")) { worker = work().finally(() => { worker = null; }); } return jobs; }

export function startConversionWorker() { if (!worker) worker = work().finally(() => { worker = null; }); }

export async function enqueueConversion(relativePath: string, start = true) {
  const { root } = await paths(); const source = await fs.realpath(path.resolve(root, relativePath)); const inside = path.relative(root, source);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside) || inside.split(path.sep).some((part) => part.startsWith("."))) throw new Error("Conversion source must remain inside the media library.");
  const probe = await probeMedia(source); if (probe.mobileCompatible) return null;
  const jobs = await readJobs(); const existing = jobs.find((job) => job.source === inside && job.status !== "failed"); if (existing) return existing;
  const parsed = path.parse(inside); const output = path.join(parsed.dir, `${parsed.name}.mp4`); const now = new Date().toISOString();
  const job: ConversionJob = { id: createHash("sha256").update(`${inside}:${now}`).digest("hex").slice(0, 16), source: inside, output, status: "queued", error: null, createdAt: now, updatedAt: now };
  jobs.push(job); await writeJobs(jobs); if (start) startConversionWorker(); return job;
}
