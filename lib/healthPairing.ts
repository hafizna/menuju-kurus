import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { updateJsonRecords } from "./atomicStore";
import type { HealthCredential } from "./healthConnection";
import { keys } from "./redis";
import { getUserById } from "./users";

const PAIRING_TTL_MS = 5 * 60 * 1000;
const MAX_INSTALLS = 16;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

interface PairingTicket {
  codeHash: string;
  expiresAt: string;
  accessVersion: string;
  origin: string;
}

// Installations are intentionally absent: pairing a second Shortcut must not
// invalidate another pending ticket or its already-working access token.
function accessVersion(credential: HealthCredential | null) {
  return hash(JSON.stringify(credential ? {
    tokenHash: credential.tokenHash,
    createdAt: credential.createdAt,
    revokedAt: credential.revokedAt,
    legacyAllowed: credential.legacyAllowed === true,
  } : null));
}

export class HealthPairingInvalid extends Error {
  constructor() { super("Pairing is no longer valid"); }
}

// Host retains the public hostname when Next normalizes nextUrl to localhost.
// Only the deployment proxy's protocol is used; forwarded-host is not trusted.
export function healthPairingOrigin(req: Pick<NextRequest, "headers" | "nextUrl">): string | null {
  try {
    const host = (req.headers.get("host") ?? req.nextUrl.host).toLowerCase();
    const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.nextUrl.protocol.slice(0, -1);
    if (!["http", "https"].includes(protocol)) return null;
    const url = new URL(`${protocol}://${host}`);
    if (url.host !== host || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    // A production build may still run locally via `next start`. Restrict the
    // HTTP exception to literal loopback hosts rather than its build mode.
    if (protocol !== "https" && !local) return null;
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin) return null;
    if (req.headers.get("sec-fetch-site") === "cross-site") return null;
    return url.origin;
  } catch { return null; }
}

export async function issueHealthPairing(userId: string, origin: string) {
  if (!getUserById(userId)) throw new HealthPairingInvalid();
  const code = `hp1.${userId}.${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  await updateJsonRecords<[PairingTicket | null, HealthCredential | null], void>(
    [keys.healthPairing(userId), keys.healthConnection(userId)],
    ([, credential]) => ({
      next: [{ codeHash: hash(code), expiresAt, accessVersion: accessVersion(credential), origin }, credential],
      result: undefined,
    }),
  );
  return { code, expiresAt, redeemUrl: `${origin}/api/health-pairing/redeem` };
}

export async function redeemHealthPairing(code: unknown, origin: string) {
  const match = typeof code === "string" ? /^hp1\.(u[1-5])\.([A-Za-z0-9_-]{43})$/.exec(code) : null;
  const user = match && getUserById(match[1]);
  if (!user) throw new HealthPairingInvalid();
  const codeHash = hash(code as string);
  // A retry reuses this token until its atomic commit succeeds. It is returned
  // only to the successful claimant, and only its hash is persisted.
  const token = `slothly.${user.id}.${randomBytes(32).toString("base64url")}`;
  const tokenHash = hash(token);
  const createdAt = new Date().toISOString();
  await updateJsonRecords<[PairingTicket | null, HealthCredential | null], void>(
    [keys.healthPairing(user.id), keys.healthConnection(user.id)],
    ([ticket, credential]) => {
      if (!ticket || ticket.origin !== origin ||
        !Number.isFinite(Date.parse(ticket.expiresAt)) || Date.parse(ticket.expiresAt) <= Date.now() ||
        ticket.accessVersion !== accessVersion(credential) ||
        !/^[a-f0-9]{64}$/.test(ticket.codeHash) ||
        !timingSafeEqual(Buffer.from(ticket.codeHash, "hex"), Buffer.from(codeHash, "hex"))) {
        throw new HealthPairingInvalid();
      }
      const current: HealthCredential = credential ?? {
        tokenHash: null, createdAt: null, revokedAt: null, legacyAllowed: true,
      };
      const installs = [...(current.installs ?? []), { tokenHash, createdAt }].slice(-MAX_INSTALLS);
      // Ticket consumption and registration must be one CAS operation: two
      // concurrent redeemers can never both receive working credentials.
      return { next: [null, { ...current, installs }], result: undefined };
    },
  );
  return { status: "paired" as const, endpoint: `${origin}/api/health-sync`, token, accountName: user.name.trim() || "Pengguna Slothly" };
}
