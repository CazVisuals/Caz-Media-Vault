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

export type ProgressRecord = { mediaId: string; seconds: number; duration: number; updatedAt: string; completed: boolean };
type AppData = {
  version: 1;
  profiles: StoredProfile[];
  progress: Record<string, Record<string, ProgressRecord>>;
  watchlists: Record<string, string[]>;
  customCollections: Record<string, string[]>;
  hiddenCollections: string[];
  collectionArtwork: Record<string, string>;
};

const EMPTY_DATA: AppData = { version: 1, profiles: [], progress: {}, watchlists: {}, customCollections: {}, hiddenCollections: [], collectionArtwork: {} };
let writes = Promise.resolve();

function dataPath() {
  return path.join(getMediaRoot(), ".constants-hub", "app-data.json");
}

async function readData(): Promise<AppData> {
  try {
    const parsed = JSON.parse(await fs.readFile(dataPath(), "utf8")) as Partial<AppData>;
    return {
      version: 1,
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      progress: parsed.progress && typeof parsed.progress === "object" ? parsed.progress : {},
      watchlists: parsed.watchlists && typeof parsed.watchlists === "object" ? parsed.watchlists : {},
      customCollections: parsed.customCollections && typeof parsed.customCollections === "object" ? parsed.customCollections : {},
      hiddenCollections: Array.isArray(parsed.hiddenCollections) ? parsed.hiddenCollections.filter((item): item is string => typeof item === "string") : [],
      collectionArtwork: parsed.collectionArtwork && typeof parsed.collectionArtwork === "object" ? parsed.collectionArtwork : {},
    };
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
    delete data.progress[id];
    delete data.watchlists[id];
    return true;
  });
}

export async function getProfileState(profileId: string) {
  const data = await readData();
  return { progress: Object.values(data.progress[profileId] ?? {}), watchlist: data.watchlists[profileId] ?? [] };
}

export async function saveProgress(profileId: string, mediaId: string, seconds: number, duration: number) {
  if (!/^[a-f0-9]{24}$/u.test(mediaId) || !Number.isFinite(seconds) || !Number.isFinite(duration)) throw new Error("Invalid playback progress.");
  return mutate((data) => {
    data.progress[profileId] ??= {};
    const completed = duration > 0 && (seconds >= duration - 45 || seconds / duration >= 0.92);
    const record = { mediaId, seconds: completed ? 0 : Math.max(0, seconds), duration: Math.max(0, duration), updatedAt: new Date().toISOString(), completed };
    data.progress[profileId][mediaId] = record;
    return record;
  });
}

export async function clearProgress(profileId: string, mediaId: string) {
  return mutate((data) => { if (data.progress[profileId]) delete data.progress[profileId][mediaId]; return true; });
}

export async function setWatchlist(profileId: string, mediaId: string, included: boolean) {
  if (!/^[a-f0-9]{24}$/u.test(mediaId)) throw new Error("Invalid media ID.");
  return mutate((data) => {
    const current = new Set(data.watchlists[profileId] ?? []);
    if (included) current.add(mediaId); else current.delete(mediaId);
    data.watchlists[profileId] = Array.from(current).slice(0, 500);
    return data.watchlists[profileId];
  });
}

export async function exportAppData() { return readData(); }

export async function restoreAppData(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Backup data is invalid.");
  const candidate = value as Partial<AppData>;
  if (!Array.isArray(candidate.profiles) || !candidate.progress || !candidate.watchlists) throw new Error("Backup is missing profiles, progress, or watchlists.");
  return mutate((data) => {
    data.profiles = candidate.profiles as StoredProfile[];
    data.progress = candidate.progress as AppData["progress"];
    data.watchlists = candidate.watchlists as AppData["watchlists"];
    data.customCollections = candidate.customCollections && typeof candidate.customCollections === "object" ? candidate.customCollections : {};
    data.hiddenCollections = Array.isArray(candidate.hiddenCollections) ? candidate.hiddenCollections.filter((item): item is string => typeof item === "string") : [];
    data.collectionArtwork = candidate.collectionArtwork && typeof candidate.collectionArtwork === "object" ? candidate.collectionArtwork : {};
    return true;
  });
}

export async function getCustomCollections() { return (await readData()).customCollections; }

export async function getCollectionPreferences() {
  const data = await readData();
  return { hiddenCollections: data.hiddenCollections, collectionArtwork: data.collectionArtwork };
}

export async function saveCustomCollection(name: string, mediaIds: string[]) {
  const cleanName = name.trim().slice(0, 60);
  if (!cleanName) throw new Error("Collection name is required.");
  const cleanIds = Array.from(new Set(mediaIds.filter((id) => /^[a-f0-9]{24}$/u.test(id)))).slice(0, 500);
  return mutate((data) => { data.customCollections[cleanName] = cleanIds; return data.customCollections; });
}

export async function deleteCustomCollection(name: string) {
  return mutate((data) => { delete data.customCollections[name]; delete data.collectionArtwork[name]; return data.customCollections; });
}

export async function renameCustomCollection(previousName: string, name: string, mediaIds: string[]) {
  const cleanPrevious = previousName.trim();
  const result = await saveCustomCollection(name, mediaIds);
  if (cleanPrevious && cleanPrevious !== name.trim()) await deleteCustomCollection(cleanPrevious);
  return result;
}

export async function updateCollectionPreferences(name: string, input: { hidden?: boolean; artworkId?: string | null }) {
  const cleanName = name.trim().slice(0, 60);
  if (!cleanName) throw new Error("Collection name is required.");
  return mutate((data) => {
    if (typeof input.hidden === "boolean") {
      const hidden = new Set(data.hiddenCollections);
      if (input.hidden) hidden.add(cleanName); else hidden.delete(cleanName);
      data.hiddenCollections = [...hidden];
    }
    if (input.artworkId === null) delete data.collectionArtwork[cleanName];
    else if (input.artworkId && /^[a-f0-9]{24}$/u.test(input.artworkId)) data.collectionArtwork[cleanName] = input.artworkId;
    return { hiddenCollections: data.hiddenCollections, collectionArtwork: data.collectionArtwork };
  });
}
