import { clearConversions, conversionsPaused, enqueueConversion, listConversions, pauseConversions, resumeConversions, scanAndQueueConversions } from "@/lib/media/conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json({ success: true, paused: await conversionsPaused(), jobs: await listConversions() }, { headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  try {
    const body = await request.json() as { source?: unknown; scan?: unknown; action?: unknown };
    if (body.action === "pause") return Response.json({ success: true, paused: await pauseConversions(), jobs: await listConversions() });
    if (body.action === "resume") return Response.json({ success: true, paused: await resumeConversions(), jobs: await listConversions() });
    if (body.action === "clear-failed") return Response.json({ success: true, paused: await conversionsPaused(), jobs: await clearConversions("failed") });
    if (body.action === "clear-finished") return Response.json({ success: true, paused: await conversionsPaused(), jobs: await clearConversions("finished") });
    const queued = [];
    if (body.scan === true) {
      queued.push(...await scanAndQueueConversions());
    } else if (typeof body.source === "string") { const job = await enqueueConversion(body.source); if (job) queued.push(job); }
    else return Response.json({ success: false, error: "A source or Inbox scan is required." }, { status: 400 });
    return Response.json({ success: true, paused: await conversionsPaused(), queued, jobs: await listConversions() });
  } catch (error) { return Response.json({ success: false, error: error instanceof Error ? error.message : "Could not queue conversion." }, { status: 500 }); }
}
