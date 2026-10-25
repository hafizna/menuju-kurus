import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { redis, keys } from "./redis";
import { getUserById, findUserByHealthSyncToken } from "./users";

interface Credential {
  tokenHash: string | null;
  createdAt: string | null;
  revokedAt: string | null;
}
export interface HealthSyncReceipt {
  receivedAt: string;
  provider: "apple_health";
  dates: string[];
  fields: string[];
}
interface HealthSyncStatus {
  lastTestAt: string | null;
  lastSync: HealthSyncReceipt | null;
}
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function getHealthConnection(userId: string) {
  const [credential, status] = await Promise.all([
    redis.get<Credential>(keys.healthConnection(userId)),
    redis.get<HealthSyncStatus>(keys.healthSyncStatus(userId)),
  ]);
  const legacyToken = getUserById(userId)?.healthSyncToken;
  const legacy = !credential && Boolean(legacyToken && findUserByHealthSyncToken(legacyToken)?.id === userId);
  return {
    configured: Boolean(credential?.tokenHash) || legacy,
    legacy,
    createdAt: credential?.createdAt ?? null,
    // An old token's successful test does not verify a freshly rotated token.
    lastTestAt: status?.lastTestAt && (!credential?.createdAt || status.lastTestAt >= credential.createdAt) ? status.lastTestAt : null,
    lastSync: status?.lastSync ?? null,
  };
}

export async function issueHealthToken(userId: string) {
  const token = `slothly.${userId}.${randomBytes(32).toString("base64url")}`;
  await redis.set(keys.healthConnection(userId), {
    tokenHash: digest(token),
    createdAt: new Date().toISOString(),
    revokedAt: null,
  } satisfies Credential);
  return { token, ...(await getHealthConnection(userId)) };
}

export async function revokeHealthToken(userId: string) {
  // Keep this tombstone: deleting the key would reactivate a legacy env token.
  await redis.set(keys.healthConnection(userId), {
    tokenHash: null,
    createdAt: null,
    revokedAt: new Date().toISOString(),
  } satisfies Credential);
  return getHealthConnection(userId);
}

export async function findHealthSyncUser(token: string) {
  const match = /^slothly\.(u[1-5])\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (match) {
    const user = getUserById(match[1]);
    if (!user) return null;
    const credential = await redis.get<Credential>(keys.healthConnection(user.id));
    if (!credential?.tokenHash || !/^[a-f0-9]{64}$/.test(credential.tokenHash)) return null;
    return timingSafeEqual(Buffer.from(digest(token), "hex"), Buffer.from(credential.tokenHash, "hex")) ? user : null;
  }
  const legacyUser = findUserByHealthSyncToken(token);
  if (!legacyUser) return null;
  // Any managed credential, including a revocation, supersedes environment keys.
  return (await redis.get<Credential>(keys.healthConnection(legacyUser.id))) ? null : legacyUser;
}

export async function recordHealthTest(userId: string) {
  const status = await redis.get<HealthSyncStatus>(keys.healthSyncStatus(userId));
  await redis.set(keys.healthSyncStatus(userId), {
    lastTestAt: new Date().toISOString(), lastSync: status?.lastSync ?? null,
  } satisfies HealthSyncStatus);
}

export async function recordHealthSync(userId: string, receipt: HealthSyncReceipt) {
  const status = await redis.get<HealthSyncStatus>(keys.healthSyncStatus(userId));
  await redis.set(keys.healthSyncStatus(userId), {
    lastTestAt: status?.lastTestAt ?? null, lastSync: receipt,
  } satisfies HealthSyncStatus);
}
