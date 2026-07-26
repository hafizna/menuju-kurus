export interface AppUser {
  id: string;
  name: string;
  password: string;
  healthSyncToken?: string;
}

// Up to 2 users, configured entirely via env vars (USER1_*, USER2_*).
// A slot is only active if its PASSWORD is set, so this also works with
// just one user configured.
export function getUsers(): AppUser[] {
  const users: AppUser[] = [];
  for (const n of [1, 2] as const) {
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
