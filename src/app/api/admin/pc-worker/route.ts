import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/request";
import { getMediaRoot } from "@/lib/media/catalog";
import { pauseConversions } from "@/lib/media/conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function controlRoot() {
  const mediaRoot = await fs.realpath(getMediaRoot());
  const root = path.join(mediaRoot, ".constants-hub", "pc-worker");
  await fs.mkdir(root, { recursive: true });
  return root;
}

async function readStatus(root: string) {
  try {
    const raw = await fs.readFile(path.join(root, "status.json"), "utf8");
    const clean = raw.replace(/^\uFEFF/, "").trim();
    return JSON.parse(clean) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function writeCommand(root: string, name: string) {
  await fs.writeFile(path.join(root, name), new Date().toISOString(), "utf8");
}

export async function GET(request: NextRequest) {
  if (!await requireAdmin(request)) return Response.json({ success: false, error: "Admin access required." }, { status: 403 });
  const root = await controlRoot();
  let enabled = false;
  try { await fs.access(path.join(root, "enabled")); enabled = true; } catch {}
  return Response.json({ success: true, enabled, status: await readStatus(root) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin(request)) return Response.json({ success: false, error: "Admin access required." }, { status: 403 });
  try {
    const body = await request.json() as { action?: string };
    const action = String(body.action || "");
    const root = await controlRoot();

    if (["enable", "run-now", "pause", "resume", "stop"].includes(action)) {
      await fs.writeFile(path.join(root, "enabled"), new Date().toISOString(), "utf8");
      await pauseConversions();
    }

    if (action === "enable") return Response.json({ success: true, enabled: true, status: await readStatus(root) });
    if (action === "run-now") {
      await fs.rm(path.join(root, "PAUSE"), { force: true });
      await writeCommand(root, "RUN_NOW");
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

    return Response.json({ success: true, enabled: true, status: await readStatus(root) });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "PC worker command failed." }, { status: 500 });
  }
}
