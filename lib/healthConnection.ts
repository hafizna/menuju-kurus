import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { redis, keys } from "./redis";
import { getUserById, findUserByHealthSyncToken } from "./users";
import { updateJsonRecord } from "./atomicStore";

export interface HealthCredential {
  tokenHash: string | null;
  createdAt: string | null;
  revokedAt: string | null;
  installs?: { tokenHash: string; createdAt: string }[];
  legacyAllowed?: boolean;
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
    redis.get<HealthCredential>(keys.healthConnection(userId)),
    redis.get<HealthSyncStatus>(keys.healthSyncStatus(userId)),
  ]);
  const legacyToken = getUserById(userId)?.healthSyncToken;
  const legacy = (!credential || credential.legacyAllowed === true) && Boolean(legacyToken && findUserByHealthSyncToken(legacyToken)?.id === userId);
  return {
    configured: Boolean(credential?.tokenHash || credential?.installs?.length) || legacy,
    legacy,
    createdAt: credential?.createdAt ?? null,
    lastPairedAt: credential?.installs?.reduce<string | null>((latest, install) =>
      !latest || install.createdAt > latest ? install.createdAt : latest, null) ?? null,
    // An old token's successful test does not verify a freshly rotated token.
    lastTestAt: status?.lastTestAt && (!credential?.createdAt || status.lastTestAt >= credential.createdAt) ? status.lastTestAt : null,
    lastSync: status?.lastSync ?? null,
  };
}

export async function issueHealthToken(userId: string) {
  // Explicit rotation replaces the complete record, revoking every paired
  // installation and environment token as well as the previous manual token.
  const token = `slothly.${userId}.${randomBytes(32).toString("base64url")}`;
  await redis.set(keys.healthConnection(userId), {
    tokenHash: digest(token),
    createdAt: new Date().toISOString(),
    revokedAt: null,
  } satisfies HealthCredential);
  return { token, ...(await getHealthConnection(userId)) };
}

export async function revokeHealthToken(userId: string) {
  // Keep this tombstone: deleting the key would reactivate a legacy env token.
  // Replacing the whole record also revokes every paired installation.
  await updateJsonRecord<HealthCredential, void>(keys.healthConnection(userId), (credential) => ({
    next: {
      tokenHash: null,
      createdAt: null,
      // Advance even within one millisecond so a repeat disconnect invalidates
      // pending pairing tickets created against an earlier tombstone.
      revokedAt: new Date(Math.max(Date.now(), (Date.parse(credential?.revokedAt ?? "") || 0) + 1)).toISOString(),
    }, result: undefined,
  }));
  return getHealthConnection(userId);
}

export async function findHealthSyncUser(token: string) {
  const match = /^slothly\.(u[1-5])\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (match) {
    const user = getUserById(match[1]);
    if (!user) return null;
    const credential = await redis.get<HealthCredential>(keys.healthConnection(user.id));
    const tokenDigest = Buffer.from(digest(token), "hex");
    const hashes = [credential?.tokenHash, ...(credential?.installs ?? []).map((install) => install.tokenHash)];
    let matched = false;
    for (const hash of hashes) {
      if (hash && /^[a-f0-9]{64}$/.test(hash)) {
        matched = timingSafeEqual(tokenDigest, Buffer.from(hash, "hex")) || matched;
      }
    }
    return matched ? user : null;
  }
  const legacyUser = findUserByHealthSyncToken(token);
  if (!legacyUser) return null;
  // Additive pairing preserves a pre-existing environment token. An explicit
  // manual rotation or disconnection never opts back into legacy access.
  const credential = await redis.get<HealthCredential>(keys.healthConnection(legacyUser.id));
  return !credential || credential.legacyAllowed === true ? legacyUser : null;
}

export async function recordHealthTest(userId: string) {
  const testedAt = new Date().toISOString();
  await updateJsonRecord<HealthSyncStatus, void>(keys.healthSyncStatus(userId), (status) => ({
    next: {
      lastTestAt: status?.lastTestAt && status.lastTestAt > testedAt ? status.lastTestAt : testedAt,
      lastSync: status?.lastSync ?? null,
    }, result: undefined,
  }));
}

export async function recordHealthSync(userId: string, receipt: HealthSyncReceipt) {
  await updateJsonRecord<HealthSyncStatus, void>(keys.healthSyncStatus(userId), (status) => ({
    next: {
      lastTestAt: status?.lastTestAt ?? null,
      lastSync: status?.lastSync && status.lastSync.receivedAt > receipt.receivedAt ? status.lastSync : receipt,
    }, result: undefined,
  }));
}
