import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getMediaRoot } from "@/lib/media/catalog";

const scrypt = promisify(scryptCallback);

export type ProfileRole = "family" | "kids" | "guest";

export type PublicProfile = {
  id: string;
  username: string;
  displayName: string;
  role: ProfileRole;
  disabled: boolean;
  expiresAt: string | null;
  createdAt: string;
};

type StoredProfile = PublicProfile & {
  passwordHash: string;
  passwordSalt: string;
  pinHash: string | null;
  pinSalt: string | null;
};

type AppData = { version: 1; profiles: StoredProfile[] };

const EMPTY_DATA: AppData = { version: 1, profiles: [] };
let writes = Promise.resolve();

function dataPath() {
  return path.join(getMediaRoot(), ".constants-hub", "app-data.json");
}

async function readData(): Promise<AppData> {
  try {
    const parsed = JSON.parse(await fs.readFile(dataPath(), "utf8")) as Partial<AppData>;
    return { version: 1, profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_DATA);
    throw error;
  }
}

async function writeData(data: AppData) {
  const file = dataPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
}

async function mutate<T>(operation: (data: AppData) => Promise<T> | T) {
  let result!: T;
  writes = writes.then(async () => {
    const data = await readData();
    result = await operation(data);
    await writeData(data);
  });
  await writes;
  return result;
}

async function hashSecret(value: string, salt = randomBytes(16).toString("hex")) {
  const derived = await scrypt(value, salt, 64) as Buffer;
  return { hash: derived.toString("hex"), salt };
}

async function matchesSecret(value: string, hash: string, salt: string) {
  const derived = Buffer.from((await hashSecret(value, salt)).hash, "hex");
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function publicProfile(profile: StoredProfile): PublicProfile {
  const { id, username, displayName, role, disabled, expiresAt, createdAt } = profile;
  return { id, username, displayName, role, disabled, expiresAt, createdAt };
}

export async function listProfiles() {
  return (await readData()).profiles.map(publicProfile);
}

export async function findProfileById(id: string) {
  const profile = (await readData()).profiles.find((item) => item.id === id);
  return profile ? publicProfile(profile) : null;
}

export async function authenticateProfile(username: string, password: string) {
  const profile = (await readData()).profiles.find((item) => item.username.toLowerCase() === username.trim().toLowerCase());
  if (!profile || profile.disabled || (profile.expiresAt && Date.parse(profile.expiresAt) <= Date.now())) return null;
  if (!await matchesSecret(password, profile.passwordHash, profile.passwordSalt)) return null;
  return publicProfile(profile);
}

export async function createProfile(input: { username: string; displayName: string; password: string; role: ProfileRole; pin?: string; expiresAt?: string | null }) {
  const username = input.username.trim();
  const displayName = input.displayName.trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/u.test(username)) throw new Error("Username must be 3–32 letters, numbers, dots, dashes, or underscores.");
  if (displayName.length < 1 || displayName.length > 40) throw new Error("Display name must be 1–40 characters.");
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (input.role === "kids" && input.pin && !/^\d{4,8}$/u.test(input.pin)) throw new Error("Kids PIN must be 4–8 digits.");
  const expiresAt = input.role === "guest" && input.expiresAt ? new Date(input.expiresAt).toISOString() : null;
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw new Error("Guest expiration must be in the future.");
  const passwordSecret = await hashSecret(input.password);
  const pinSecret = input.pin ? await hashSecret(input.pin) : null;
  return mutate(async (data) => {
    if (data.profiles.some((item) => item.username.toLowerCase() === username.toLowerCase())) throw new Error("That username already exists.");
    const profile: StoredProfile = {
      id: randomUUID(), username, displayName, role: input.role, disabled: false, expiresAt,
      createdAt: new Date().toISOString(), passwordHash: passwordSecret.hash, passwordSalt: passwordSecret.salt,
      pinHash: pinSecret?.hash ?? null, pinSalt: pinSecret?.salt ?? null,
    };
    data.profiles.push(profile);
    return publicProfile(profile);
  });
}

export async function updateProfile(id: string, input: { displayName?: string; password?: string; pin?: string; disabled?: boolean; expiresAt?: string | null }) {
  return mutate(async (data) => {
    const profile = data.profiles.find((item) => item.id === id);
    if (!profile) throw new Error("Profile not found.");
    if (typeof input.displayName === "string") profile.displayName = input.displayName.trim().slice(0, 40) || profile.displayName;
    if (typeof input.disabled === "boolean") profile.disabled = input.disabled;
    if (input.expiresAt !== undefined) profile.expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : null;
    if (input.password) {
      if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");
      const secret = await hashSecret(input.password); profile.passwordHash = secret.hash; profile.passwordSalt = secret.salt;
    }
    if (input.pin) {
      if (!/^\d{4,8}$/u.test(input.pin)) throw new Error("PIN must be 4–8 digits.");
      const secret = await hashSecret(input.pin); profile.pinHash = secret.hash; profile.pinSalt = secret.salt;
    }
    return publicProfile(profile);
  });
}

export async function deleteProfile(id: string) {
  return mutate((data) => {
    const before = data.profiles.length;
    data.profiles = data.profiles.filter((item) => item.id !== id);
    if (data.profiles.length === before) throw new Error("Profile not found.");
    return true;
  });
}
