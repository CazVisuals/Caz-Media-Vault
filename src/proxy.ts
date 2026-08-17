import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

function requestHostname(request: NextRequest) {
  const host = request.headers.get("host") || "";
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":")[0].toLowerCase();
}

function isPrivateHostname(hostname: string) {
  if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".local")) return true;
  if (/^127\./u.test(hostname) || /^10\./u.test(hostname) || /^192\.168\./u.test(hostname)) return true;
  const match = hostname.match(/^172\.(\d{1,3})\./u);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function isPublicAuthRoute(pathname: string) {
  return pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout" || pathname === "/api/auth/status" || pathname.startsWith("/invite/") || pathname.startsWith("/api/invite/");
}

function isOwnerOnlyRoute(pathname: string) {
  return pathname === "/settings/profiles" || pathname === "/api/admin/profiles" || pathname === "/api/admin/invites" || pathname === "/api/admin/backup";
}

function isAdminRoute(pathname: string) {
  if (pathname === "/settings" || pathname.startsWith("/settings/") || pathname === "/organize") return true;
  if (pathname.startsWith("/api/admin/") || ["/api/media/move", "/api/media/artwork/sync", "/api/media/conversions", "/api/media/inspect", "/api/media/scan", "/api/media/collections"].includes(pathname)) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const cameThroughCloudflare = Boolean(request.headers.get("cf-ray") || request.headers.get("cf-connecting-ip"));
  const directPrivateRequest = !cameThroughCloudflare && isPrivateHostname(requestHostname(request));
  const { pathname, search } = request.nextUrl;
  if (isPublicAuthRoute(pathname)) return NextResponse.next();
  if (directPrivateRequest && !isAdminRoute(pathname)) return NextResponse.next();
  const username = process.env.AUTH_USERNAME ?? "";
  const password = process.env.AUTH_PASSWORD ?? "";
  const secret = process.env.AUTH_SECRET ?? "";
  if (!username || !password || secret.length < 32) return new NextResponse("Public authentication is not fully configured.", { status: 503 });
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token, secret);
  if (isOwnerOnlyRoute(pathname)) {
    if (session?.role === "owner") return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
    const loginUrl = new URL("/login", request.url); loginUrl.searchParams.set("next", pathname); return NextResponse.redirect(loginUrl);
  }
  if (isAdminRoute(pathname)) {
    if (session?.role === "owner" || session?.role === "admin") return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const loginUrl = new URL("/login", request.url); loginUrl.searchParams.set("next", pathname); return NextResponse.redirect(loginUrl);
  }
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const loginUrl = new URL("/login", request.url); loginUrl.searchParams.set("next", `${pathname}${search}`); return NextResponse.redirect(loginUrl);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
