import { NextRequest } from "next/server";
import { createInvite, listInvites, revokeInvite } from "@/lib/app-data/invites";
import type { ProfileRole } from "@/lib/app-data/store";
import { requireOwner } from "@/lib/auth/request";

export const dynamic = "force-dynamic";
const ROLES: ProfileRole[] = ["admin", "family", "kids", "guest"];

function publicOrigin(request: NextRequest) {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) {
    try { return new URL(configured).origin; } catch { /* fall through */ }
  }
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost && !/^(0\.0\.0\.0|127\.0\.0\.1|localhost)(:\d+)?$/i.test(forwardedHost)) return `${forwardedProto}://${forwardedHost}`;
  const host = request.headers.get("host")?.trim();
  if (host && !/^(0\.0\.0\.0|127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) return `${request.nextUrl.protocol}//${host}`;
  return "https://media.themovecentral.com";
}

export async function GET(request: NextRequest) {
  if (!await requireOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  return Response.json({ success: true, invites: await listInvites() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!await requireOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const role = String(body.role || "family") as ProfileRole;
    if (!ROLES.includes(role)) throw new Error("Choose Admin, Family, Kids, or Guest.");
    const result = await createInvite({ role, expiresAt: typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : null });
    const url = new URL(`/invite/${encodeURIComponent(result.token)}`, publicOrigin(request)).toString();
    return Response.json({ success: true, invite: result.invite, url }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create invite." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!await requireOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    return Response.json({ success: true, invite: await revokeInvite(id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not revoke invite." }, { status: 400 });
  }
}
