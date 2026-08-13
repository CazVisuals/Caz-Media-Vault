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
  return pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout";
}

export async function proxy(request: NextRequest) {
  const cameThroughCloudflare = Boolean(
    request.headers.get("cf-ray") || request.headers.get("cf-connecting-ip"),
  );
  const directPrivateRequest = !cameThroughCloudflare && isPrivateHostname(requestHostname(request));

  if (process.env.PUBLIC_AUTH_ENABLED !== "true" || directPrivateRequest) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (isPublicAuthRoute(pathname)) return NextResponse.next();

  const username = process.env.AUTH_USERNAME ?? "";
  const secret = process.env.AUTH_SECRET ?? "";
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (username && secret.length >= 32 && await verifySessionToken(token, secret, username)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
