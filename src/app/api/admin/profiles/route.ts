import { NextRequest } from "next/server";
import { createProfile, deleteProfile, listProfiles, type ProfileRole, updateProfile } from "@/lib/app-data/store";
import { requireOwner } from "@/lib/auth/request";

export const dynamic = "force-dynamic";

async function ownerOnly(request: NextRequest) {
  if (!await requireOwner(request)) return Response.json({ error: "Owner access required." }, { status: 403 });
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await ownerOnly(request); if (denied) return denied;
  return Response.json({ success: true, profiles: await listProfiles() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const denied = await ownerOnly(request); if (denied) return denied;
  try {
    const body = await request.json() as Record<string, unknown>;
    const role = body.role;
    if (!(["family", "kids", "guest"] as unknown[]).includes(role)) throw new Error("Choose Family, Kids, or Guest.");
    const profile = await createProfile({
      username: String(body.username ?? ""), displayName: String(body.displayName ?? ""), password: String(body.password ?? ""),
      role: role as ProfileRole, pin: typeof body.pin === "string" ? body.pin : undefined,
      expiresAt: typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : null,
    });
    return Response.json({ success: true, profile }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not create profile." }, { status: 400 }); }
}

export async function PATCH(request: NextRequest) {
  const denied = await ownerOnly(request); if (denied) return denied;
  try {
    const body = await request.json() as Record<string, unknown>;
    const profile = await updateProfile(String(body.id ?? ""), {
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      password: typeof body.password === "string" && body.password ? body.password : undefined,
      pin: typeof body.pin === "string" && body.pin ? body.pin : undefined,
      disabled: typeof body.disabled === "boolean" ? body.disabled : undefined,
      expiresAt: typeof body.expiresAt === "string" ? body.expiresAt || null : undefined,
    });
    return Response.json({ success: true, profile });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not update profile." }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  const denied = await ownerOnly(request); if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    await deleteProfile(id);
    return Response.json({ success: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not delete profile." }, { status: 400 }); }
}
