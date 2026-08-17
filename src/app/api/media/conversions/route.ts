import { clearConversions, conversionOverrideActive, conversionsPaused, enqueueConversion, listConversions, pauseConversions, resumeConversions, runConversionsNow, scanAndQueueConversions } from "@/lib/media/conversion";
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/request";
import { streamingActive, withinConversionSchedule } from "@/lib/media/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!await requireAdmin(request)) return Response.json({ success: false, error: "Admin access required." }, { status: 403 });
  const streaming = await streamingActive();
  const overrideActive = await conversionOverrideActive();
  return Response.json({ success: true, paused: await conversionsPaused(), overrideActive, policyPaused: streaming || (!withinConversionSchedule() && !overrideActive), policyReason: streaming ? "Streaming is active" : !withinConversionSchedule() && !overrideActive ? "Waiting for overnight window" : null, jobs: await listConversions() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin(request)) return Response.json({ success: false, error: "Admin access required." }, { status: 403 });
  try {
    const body = await request.json() as { source?: unknown; scan?: unknown; action?: unknown; runNow?: unknown };
    if (body.action === "pause") return Response.json({ success: true, paused: await pauseConversions(), jobs: await listConversions() });
    if (body.action === "resume") return Response.json({ success: true, paused: await resumeConversions(), jobs: await listConversions() });
    if (body.action === "clear-failed") return Response.json({ success: true, paused: await conversionsPaused(), jobs: await clearConversions("failed") });
    if (body.action === "clear-finished") return Response.json({ success: true, paused: await conversionsPaused(), jobs: await clearConversions("finished") });
    const queued = [];
    if (body.scan === true) {
      queued.push(...await scanAndQueueConversions());
    } else if (typeof body.source === "string") { const job = await enqueueConversion(body.source); if (job) queued.push(job); }
    else return Response.json({ success: false, error: "A source or Inbox scan is required." }, { status: 400 });
    if (body.runNow === true) await runConversionsNow();
    return Response.json({ success: true, paused: await conversionsPaused(), overrideActive: await conversionOverrideActive(), queued, jobs: await listConversions() });
  } catch (error) { return Response.json({ success: false, error: error instanceof Error ? error.message : "Could not queue conversion." }, { status: 500 }); }
}
