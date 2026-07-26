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

// Converts a local wall-clock time (e.g. "07:30" on 2026-07-26 in Asia/Jakarta)
// into a real UTC instant, so a stored wake time can be compared against
// other timestamps regardless of what timezone the server itself runs in.
export function zonedTimeToUtcISO(dateKey: string, hour: number, minute: number, timeZone: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const naiveUTC = Date.UTC(y, m - 1, d, hour, minute, 0);
  const naiveDate = new Date(naiveUTC);
  const tzString = naiveDate.toLocaleString("en-US", { timeZone });
  const utcString = naiveDate.toLocaleString("en-US", { timeZone: "UTC" });
  const offsetMs = new Date(tzString).getTime() - new Date(utcString).getTime();
  return new Date(naiveUTC - offsetMs).toISOString();
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
