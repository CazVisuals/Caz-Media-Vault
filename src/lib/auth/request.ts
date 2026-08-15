import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, type SessionPayload, verifySessionToken } from "./session";
import { findProfileById } from "@/lib/app-data/store";

export async function currentSession(request: NextRequest): Promise<SessionPayload | null> {
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value, process.env.AUTH_SECRET ?? "");
  if (!session) return null;
  if (session.role === "owner" && session.profileId === "bootstrap-owner") return session;
  const profile = await findProfileById(session.profileId);
  if (!profile || profile.disabled || (profile.expiresAt && Date.parse(profile.expiresAt) <= Date.now())) return null;
  return session;
}

export async function requireOwner(request: NextRequest) {
  const session = await currentSession(request);
  return session?.role === "owner" ? session : null;
}
