import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/request";
import { deleteCustomCollection, getCollectionPreferences, getCustomCollections, renameCustomCollection, updateCollectionPreferences } from "@/lib/app-data/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const [collections, preferences] = await Promise.all([getCustomCollections(), getCollectionPreferences()]);
  return Response.json({ collections, ...preferences }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin(request)) return Response.json({ error: "Admin access required." }, { status: 403 });
  try { const body = await request.json() as { name?: string; previousName?: string; mediaIds?: string[] }; return Response.json({ success: true, collections: await renameCustomCollection(body.previousName || "", body.name || "", Array.isArray(body.mediaIds) ? body.mediaIds : []) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save collection." }, { status: 400 }); }
}

export async function PATCH(request: NextRequest) {
  if (!await requireAdmin(request)) return Response.json({ error: "Admin access required." }, { status: 403 });
  try {
    const body = await request.json() as { name?: string; hidden?: boolean; artworkId?: string | null };
    return Response.json({ success: true, ...(await updateCollectionPreferences(body.name || "", { hidden: body.hidden, artworkId: body.artworkId })) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not update collection." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  if (!await requireAdmin(request)) return Response.json({ error: "Admin access required." }, { status: 403 });
  return Response.json({ success: true, collections: await deleteCustomCollection(new URL(request.url).searchParams.get("name") || "") });
}
