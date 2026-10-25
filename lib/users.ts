export interface AppUser {
  id: string;
  name: string;
  inviteCode: string;
  healthSyncToken?: string;
}

// Up to 5 users, configured via env vars (USER1_*..USER5_*). A slot is only
// active if its INVITE_CODE is set. The code is a one-time key: the invitee
// uses it to get in once and choose their own PIN (stored hashed in Redis);
// after that it stops working and daily login is PIN-only.
export function getUsers(): AppUser[] {
  const users: AppUser[] = [];
  for (const n of [1, 2, 3, 4, 5] as const) {
    const inviteCode = process.env[`USER${n}_INVITE_CODE`];
    if (!inviteCode) continue;
    users.push({
      id: `u${n}`,
      name: process.env[`USER${n}_NAME`] || `User ${n}`,
      inviteCode,
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
