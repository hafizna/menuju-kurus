// Day boundaries follow the user's timezone (default Asia/Jakarta) so a serverless
// function running in UTC still buckets entries into the "right" local day.

export function todayKey(timezone: string): string {
  return dateKeyFor(new Date(), timezone);
}

export function dateKeyFor(date: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // en-CA locale gives YYYY-MM-DD
}

export function localHour(date: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  });
  const part = fmt.format(date);
  return parseInt(part, 10) % 24;
}

export function lastNDateKeys(n: number, timezone: string): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    keys.push(dateKeyFor(d, timezone));
  }
  return keys;
}
