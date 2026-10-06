export interface AppUser {
  id: string;
  name: string;
  email: string;
  healthSyncToken?: string;
}

// Up to 5 users, configured entirely via env vars (USER1_*..USER5_*).
// A slot is only active if its EMAIL is set, so this also works with just
// one user configured. Identity itself comes from Google Sign-In (Google
// verifies the email belongs to whoever is signing in) — this file only
// decides which already-verified emails are let in and which internal
// userId (u1..u5) they map to.
export function getUsers(): AppUser[] {
  const users: AppUser[] = [];
  for (const n of [1, 2, 3, 4, 5] as const) {
    const email = process.env[`USER${n}_EMAIL`];
    if (!email) continue;
    users.push({
      id: `u${n}`,
      name: process.env[`USER${n}_NAME`] || `User ${n}`,
      email: email.trim().toLowerCase(),
      healthSyncToken: process.env[`USER${n}_HEALTH_SYNC_TOKEN`] || undefined,
    });
  }
  return users;
}

export function getUserById(id: string): AppUser | undefined {
  return getUsers().find((u) => u.id === id);
}

export function findUserByHealthSyncToken(token: string): AppUser | null {
  if (!token) return null;
  const matches = getUsers().filter((user) => user.healthSyncToken === token);
  return matches.length === 1 ? matches[0] : null;
}

export function findUserByEmail(email: string): AppUser | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  // Duplicate emails across slots are a config mistake — fail closed rather
  // than guessing which slot the signed-in person meant.
  const matches = getUsers().filter((user) => user.email === normalized);
  return matches.length === 1 ? matches[0] : null;
}
