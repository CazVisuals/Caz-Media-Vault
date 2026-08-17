import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const usernameConfigured = Boolean(process.env.AUTH_USERNAME);
  const passwordConfigured = Boolean(process.env.AUTH_PASSWORD);
  const secretConfigured = (process.env.AUTH_SECRET?.length ?? 0) >= 32;

  return Response.json({
    authenticationConfigured: usernameConfigured && passwordConfigured && secretConfigured,
    usernameConfigured,
    passwordConfigured,
    secretConfigured,
    throughCloudflare: Boolean(request.headers.get("cf-ray") || request.headers.get("cf-connecting-ip")),
  }, { headers: { "Cache-Control": "no-store" } });
}
