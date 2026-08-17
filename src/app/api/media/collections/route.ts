import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/request";
import { deleteCustomCollection, getCustomCollections, saveCustomCollection } from "@/lib/app-data/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ collections: await getCustomCollections() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!await requireOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  try { const body = await request.json() as { name?: string; mediaIds?: string[] }; return Response.json({ success: true, collections: await saveCustomCollection(body.name || "", Array.isArray(body.mediaIds) ? body.mediaIds : []) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save collection." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  if (!await requireOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  return Response.json({ success: true, collections: await deleteCustomCollection(new URL(request.url).searchParams.get("name") || "") });
}
