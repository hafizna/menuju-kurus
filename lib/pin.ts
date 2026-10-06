import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { redis } from "./redis";

// Only used from regular (Node runtime) API routes, never from middleware —
// node:crypto isn't available on the Edge runtime that middleware.ts runs on.

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

interface PinRecord {
  hash: string;
  salt: string;
  setAt: string;
}

function pinKey(userId: string): string {
  return `mk:${userId}:pin`;
}

async function derive(pin: string, salt: string): Promise<string> {
  const buf = await scryptAsync(pin, salt, 64);
  return buf.toString("hex");
}

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{6}$/.test(pin);
}

export async function setPin(userId: string, pin: string): Promise<void> {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(pin, salt);
  const record: PinRecord = { hash, salt, setAt: new Date().toISOString() };
  await redis.set(pinKey(userId), record);
}

export async function hasPin(userId: string): Promise<boolean> {
  return (await redis.get(pinKey(userId))) !== null;
}

export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  const record = await redis.get<PinRecord>(pinKey(userId));
  if (!record) return false;
  const candidate = await derive(pin, record.salt);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(record.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// A 6-digit PIN only has 1e6 combinations, so login attempts are throttled
// per IP — a handful of typos are fine, scripted guessing is not.
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_SECONDS = 600;

function attemptKey(ip: string): string {
  return `mk:ratelimit:pin:${ip}`;
}

export async function isPinRateLimited(ip: string): Promise<boolean> {
  const count = (await redis.get<number>(attemptKey(ip))) ?? 0;
  return count >= ATTEMPT_LIMIT;
}

export async function recordPinAttempt(ip: string): Promise<void> {
  const key = attemptKey(ip);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ATTEMPT_WINDOW_SECONDS);
}
