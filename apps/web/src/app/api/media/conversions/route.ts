import { enqueueConversion, listConversions, scanAndQueueConversions } from "@/lib/media/conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json({ success: true, jobs: await listConversions() }, { headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  try {
    const body = await request.json() as { source?: unknown; scan?: unknown };
    const queued = [];
    if (body.scan === true) {
      queued.push(...await scanAndQueueConversions());
    } else if (typeof body.source === "string") { const job = await enqueueConversion(body.source); if (job) queued.push(job); }
    else return Response.json({ success: false, error: "A source or Inbox scan is required." }, { status: 400 });
    return Response.json({ success: true, queued, jobs: await listConversions() });
  } catch (error) { return Response.json({ success: false, error: error instanceof Error ? error.message : "Could not queue conversion." }, { status: 500 }); }
}
