import { getUsers, AppUser } from "./users";

export const SESSION_COOKIE = "mk_session";

// Uses Web Crypto (SubtleCrypto) instead of Node's `crypto` module because this
// also runs inside Next.js Edge middleware, which doesn't support node:crypto.

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET env var is not set");
  return s;
}

async function hmacHex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function findUserByPassword(candidate: string): AppUser | null {
  for (const u of getUsers()) {
    if (constantTimeEqual(candidate, u.password)) return u;
  }
  return null;
}

// Cookie value is "<userId>.<hmac(userId)>" — stateless (no server-side
// session store needed) while still binding the cookie to one specific user.
export async function makeSessionToken(userId: string): Promise<string> {
  return `${userId}.${await hmacHex(userId)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(userId);
  return constantTimeEqual(sig, expected) ? userId : null;
}
