export interface AppUser {
  id: string;
  name: string;
  password: string;
  healthSyncToken?: string;
}

// Up to 5 users, configured entirely via env vars (USER1_*..USER5_*).
// A slot is only active if its PASSWORD is set, so this also works with
// just one user configured.
export function getUsers(): AppUser[] {
  const users: AppUser[] = [];
  for (const n of [1, 2, 3, 4, 5] as const) {
    const password = process.env[`USER${n}_PASSWORD`];
    if (!password) continue;
    users.push({
      id: `u${n}`,
      name: process.env[`USER${n}_NAME`] || `User ${n}`,
      password,
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
