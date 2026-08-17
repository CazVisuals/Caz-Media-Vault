import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/request";
import { exportAppData, restoreAppData } from "@/lib/app-data/store";
import { buildLibrary } from "@/lib/media/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await requireOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  const backup = { format: "constants-hub-backup", version: 1, createdAt: new Date().toISOString(), appData: await exportAppData(), library: await buildLibrary(), settings: { conversionScheduleEnabled: process.env.CONVERSION_SCHEDULE_ENABLED ?? "true", conversionStartHour: process.env.CONVERSION_START_HOUR ?? "0", conversionEndHour: process.env.CONVERSION_END_HOUR ?? "7" } };
  return new Response(`${JSON.stringify(backup, null, 2)}\n`, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="constants-hub-backup-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!await requireOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const backup = await request.json() as { format?: string; appData?: unknown };
    if (backup.format !== "constants-hub-backup") throw new Error("This is not a Constant’s Hub backup.");
    await restoreAppData(backup.appData);
    return Response.json({ success: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Restore failed." }, { status: 400 }); }
}
