export const SESSION_COOKIE = "mk_session";

// Uses Web Crypto (SubtleCrypto) instead of Node's `crypto` module because this
// runs inside Next.js Edge middleware, which doesn't support node:crypto.

function secret(): string {
  const s = process.env.APP_PASSWORD;
  if (!s) throw new Error("APP_PASSWORD env var is not set");
  return s;
}

async function hmacHex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedSessionToken(): Promise<string> {
  return hmacHex("mk-session-v1");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isValidPassword(candidate: string): boolean {
  return constantTimeEqual(candidate, secret());
}

export async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await expectedSessionToken();
  return constantTimeEqual(token, expected);
}
