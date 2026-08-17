export const AUTH_COOKIE_NAME = "constants_hub_session";
export const AUTH_SESSION_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  username: string;
  expiresAt: number;
};

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function createSessionToken(username: string, secret: string) {
  const payload: SessionPayload = {
    username,
    expiresAt: Date.now() + AUTH_SESSION_SECONDS * 1000,
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  return `${encoded}.${await sign(encoded, secret)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string, username: string) {
  if (!token || !secret || !username) return false;

  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return false;

  const expectedSignature = await sign(encoded, secret);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(decodeBase64Url(encoded)) as SessionPayload;
    return payload.username === username && Number.isFinite(payload.expiresAt) && payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}
