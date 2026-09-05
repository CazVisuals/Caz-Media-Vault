import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/request";
import { getMediaRoot } from "@/lib/media/catalog";
import { pauseConversions } from "@/lib/media/conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PcJob = {
  id: string;
  source: string;
  output?: string;
  mode?: string;
  status: "converting" | "copying" | "completed" | "failed";
  error?: string;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
};

type MaintenanceReport = {
  status?: string;
  startedAt?: string;
  completedAt?: string;
  scanned?: number;
  mobileReady?: number;
  incompatible?: number;
  probeErrors?: number;
  exactDuplicatesRemoved?: number;
  duplicatePolicy?: string;
  incompatibleFiles?: { path: string; size?: number }[];
};

async function controlRoot() {
  const mediaRoot = await fs.realpath(getMediaRoot());
  const root = path.join(mediaRoot, ".constants-hub", "pc-worker");
  await fs.mkdir(root, { recursive: true });
  return root;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const clean = raw.replace(/^\uFEFF/, "").trim();
    return clean ? JSON.parse(clean) as T : fallback;
  } catch {
    return fallback;
  }
}

async function readStatus(root: string) { return readJson<Record<string, unknown> | null>(path.join(root, "status.json"), null); }
async function readHistory(root: string) { return readJson<PcJob[]>(path.join(root, "history.json"), []); }
async function readMaintenance(root: string) { return readJson<MaintenanceReport | null>(path.join(root, "maintenance.json"), null); }

async function writeHistory(root: string, jobs: PcJob[]) {
  const file = path.join(root, "history.json");
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(jobs.slice(0, 250), null, 2), "utf8");
  await fs.rename(temp, file);
}

async function writeCommand(root: string, name: string) { await fs.writeFile(path.join(root, name), new Date().toISOString(), "utf8"); }

async function payload(root: string, enabled: boolean, details = true, offset = 0, limit = 50) {
  const maintenance = await readMaintenance(root);
  const maintenanceSummary = maintenance ? {
    status: maintenance.status,
    startedAt: maintenance.startedAt,
    completedAt: maintenance.completedAt,
    scanned: maintenance.scanned,
    mobileReady: maintenance.mobileReady,
    incompatible: maintenance.incompatible,
    probeErrors: maintenance.probeErrors,
    exactDuplicatesRemoved: maintenance.exactDuplicatesRemoved,
    duplicatePolicy: maintenance.duplicatePolicy,
  } : null;
  return {
    success: true,
    enabled,
    status: await readStatus(root),
    history: details ? (await readHistory(root)).slice(offset, offset + limit) : undefined,
    maintenance: details && maintenance ? {
      ...maintenanceSummary,
      incompatibleFiles: maintenance.incompatibleFiles?.slice(offset, offset + limit),
    } : maintenanceSummary,
  };
}

export async function GET(request: NextRequest) {
  if (!await requireAdmin(request)) return Response.json({ success: false, error: "Admin access required." }, { status: 403 });
  const root = await controlRoot();
  let enabled = false;
  try { await fs.access(path.join(root, "enabled")); enabled = true; } catch {}
  const details = new URL(request.url).searchParams.get("details") !== "0";
  const offset = Math.max(0, Number(new URL(request.url).searchParams.get("offset")) || 0);
  const limit = Math.max(1, Math.min(50, Number(new URL(request.url).searchParams.get("limit")) || 50));
  return Response.json(await payload(root, enabled, details, offset, limit), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin(request)) return Response.json({ success: false, error: "Admin access required." }, { status: 403 });
  try {
    const body = await request.json() as { action?: string };
    const action = String(body.action || "");
    const root = await controlRoot();

    if (action === "clear-completed" || action === "clear-failed") {
      const target = action === "clear-completed" ? "completed" : "failed";
      const history = (await readHistory(root)).filter((job) => job.status !== target);
      await writeHistory(root, history);
      let enabled = false;
      try { await fs.access(path.join(root, "enabled")); enabled = true; } catch {}
      return Response.json(await payload(root, enabled));
    }

    if (["enable", "run-now", "pause", "resume", "stop", "end-override", "run-maintenance"].includes(action)) {
      await fs.writeFile(path.join(root, "enabled"), new Date().toISOString(), "utf8");
      await pauseConversions();
    }

    if (action === "enable") return Response.json(await payload(root, true));
    if (action === "run-now") {
      await fs.rm(path.join(root, "PAUSE"), { force: true });
      await writeCommand(root, "RUN_NOW");
    } else if (action === "end-override") {
      await writeCommand(root, "END_OVERRIDE");
    } else if (action === "run-maintenance") {
      await writeCommand(root, "RUN_MAINTENANCE");
    } else if (action === "pause") {
      await writeCommand(root, "PAUSE");
    } else if (action === "resume") {
      await fs.rm(path.join(root, "PAUSE"), { force: true });
      await writeCommand(root, "RUN_NOW");
    } else if (action === "stop") {
      await writeCommand(root, "STOP");
    } else {
      return Response.json({ success: false, error: "Unknown PC worker action." }, { status: 400 });
    }

    return Response.json(await payload(root, true));
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "PC worker command failed." }, { status: 500 });
  }
}
