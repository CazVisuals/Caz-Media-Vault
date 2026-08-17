import { NextRequest } from "next/server";
import { currentSession } from "@/lib/auth/request";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await currentSession(request);
  return Response.json({
    authenticated: Boolean(session),
    profile: session ? { id: session.profileId, username: session.username, displayName: session.displayName, role: session.role } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
