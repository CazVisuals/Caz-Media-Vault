import { NextRequest } from "next/server";
import { acceptInvite, getInviteByToken } from "@/lib/app-data/invites";
import { createProfile } from "@/lib/app-data/store";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const invite = await getInviteByToken(token);
  if (!invite) return Response.json({ error: "This invite is invalid, expired, revoked, or already used." }, { status: 404 });
  return Response.json({ success: true, invite: { role: invite.role, expiresAt: invite.expiresAt } }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    const invite = await getInviteByToken(token);
    if (!invite) throw new Error("This invite is invalid, expired, revoked, or already used.");
    const body = await request.json() as Record<string, unknown>;
    const profile = await createProfile({
      username: String(body.username || ""), displayName: String(body.displayName || ""), password: String(body.password || ""),
      role: invite.role, pin: typeof body.pin === "string" ? body.pin : undefined,
      expiresAt: invite.role === "guest" ? invite.expiresAt : null,
    });
    await acceptInvite(token);
    return Response.json({ success: true, profile }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not accept invite." }, { status: 400 });
  }
}
