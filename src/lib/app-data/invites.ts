import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureAppDataRoot } from "@/lib/app-data/path";
import type { ProfileRole } from "@/lib/app-data/store";

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";
export type Invite = {
  id: string;
  role: ProfileRole;
  expiresAt: string | null;
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  tokenHash: string;
};
export type PublicInvite = Omit<Invite, "tokenHash"> & { status: InviteStatus };

const FILE = "invites.json";
let writes = Promise.resolve();

async function filePath() { return path.join(await ensureAppDataRoot(), FILE); }
async function readInvites(): Promise<Invite[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(await filePath(), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
async function writeInvites(invites: Invite[]) {
  const file = await filePath();
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(invites, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
}
async function mutate<T>(operation: (invites: Invite[]) => Promise<T> | T) {
  let result!: T;
  writes = writes.then(async () => {
    const invites = await readInvites();
    result = await operation(invites);
    await writeInvites(invites);
  });
  await writes;
  return result;
}
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function status(invite: Invite): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.acceptedAt) return "accepted";
  if (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.now()) return "expired";
  return "pending";
}
function publicInvite(invite: Invite): PublicInvite {
  return {
    id: invite.id,
    role: invite.role,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    acceptedAt: invite.acceptedAt,
    revokedAt: invite.revokedAt,
    status: status(invite),
  };
}

export async function listInvites() {
  return (await readInvites()).map(publicInvite).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createInvite(input: { role: ProfileRole; expiresAt?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : null;
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw new Error("Invite expiration must be in the future.");
  const invite: Invite = {
    id: randomUUID(), role: input.role, expiresAt, createdAt: new Date().toISOString(),
    acceptedAt: null, revokedAt: null, tokenHash: hashToken(token),
  };
  await mutate((invites) => { invites.push(invite); return true; });
  return { invite: publicInvite(invite), token };
}

export async function getInviteByToken(token: string) {
  const clean = token.trim();
  if (!clean) return null;
  const invite = (await readInvites()).find((item) => item.tokenHash === hashToken(clean));
  if (!invite) return null;
  const safe = publicInvite(invite);
  return safe.status === "pending" ? safe : null;
}

export async function acceptInvite(token: string) {
  const clean = token.trim();
  if (!clean) throw new Error("Invite token is missing.");
  return mutate((invites) => {
    const invite = invites.find((item) => item.tokenHash === hashToken(clean));
    if (!invite) throw new Error("Invite not found.");
    if (status(invite) !== "pending") throw new Error("This invite is no longer valid.");
    invite.acceptedAt = new Date().toISOString();
    return publicInvite(invite);
  });
}

export async function revokeInvite(id: string) {
  return mutate((invites) => {
    const invite = invites.find((item) => item.id === id);
    if (!invite) throw new Error("Invite not found.");
    if (status(invite) !== "pending") throw new Error("Only pending invites can be revoked.");
    invite.revokedAt = new Date().toISOString();
    return publicInvite(invite);
  });
}

export async function deleteInvite(id: string) {
  return mutate((invites) => {
    const index = invites.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Invite not found.");
    if (status(invites[index]) === "pending") throw new Error("Revoke a pending invite before deleting it.");
    invites.splice(index, 1);
    return true;
  });
}

export async function clearInviteHistory() {
  return mutate((invites) => {
    const pending = invites.filter((item) => status(item) === "pending");
    const removed = invites.length - pending.length;
    invites.splice(0, invites.length, ...pending);
    return removed;
  });
}
