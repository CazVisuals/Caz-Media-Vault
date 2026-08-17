import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, AUTH_SESSION_SECONDS, createSessionToken } from "@/lib/auth/session";
import { authenticateProfile } from "@/lib/app-data/store";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function safelyMatches(supplied: string, expected: string) {
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

function clientAddress(request: NextRequest) {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

export async function POST(request: NextRequest) {
  const configuredUsername = process.env.AUTH_USERNAME ?? "";
  const configuredPassword = process.env.AUTH_PASSWORD ?? "";
  const secret = process.env.AUTH_SECRET ?? "";

  if (!configuredUsername || !configuredPassword || secret.length < 32) {
    return NextResponse.json({ error: "Public login is not configured." }, { status: 503 });
  }

  const address = clientAddress(request);
  const now = Date.now();
  const current = attempts.get(address);
  if (current && current.resetAt > now && current.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }
  if (current && current.resetAt <= now) attempts.delete(address);

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  const bootstrapOwner = safelyMatches(username, configuredUsername) && safelyMatches(password, configuredPassword);
  const profile = bootstrapOwner ? null : await authenticateProfile(username, password);
  const valid = bootstrapOwner || Boolean(profile);

  if (!valid) {
    const previous = attempts.get(address);
    attempts.set(address, {
      count: (previous?.resetAt ?? 0) > now ? previous!.count + 1 : 1,
      resetAt: (previous?.resetAt ?? 0) > now ? previous!.resetAt : now + WINDOW_MS,
    });
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  attempts.delete(address);
  const identity = bootstrapOwner
    ? { profileId: "bootstrap-owner", username: configuredUsername, displayName: "Owner", role: "owner" as const }
    : { profileId: profile!.id, username: profile!.username, displayName: profile!.displayName, role: profile!.role };
  const guestSeconds = profile?.role === "guest" && profile.expiresAt
    ? Math.max(60, Math.min(AUTH_SESSION_SECONDS, Math.floor((Date.parse(profile.expiresAt) - Date.now()) / 1000)))
    : AUTH_SESSION_SECONDS;
  const response = NextResponse.json({ success: true, profile: { displayName: identity.displayName, role: identity.role } });
  response.cookies.set(AUTH_COOKIE_NAME, await createSessionToken(identity, secret, guestSeconds), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    maxAge: guestSeconds,
  });
  return response;
}
