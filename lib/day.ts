import { redis, keys } from "./redis";
import { DayLog, DEFAULT_SETTINGS, UserSettings } from "./types";
import { foodLogStatus } from "./energy";
import { dateKeyFor, todayKey, lastNDateKeys } from "./dates";

export { summarizeDay, computeWeeklyBudget } from "./energy";
export type { DaySummary, WeeklyBudget } from "./energy";

export async function getSettings(userId: string): Promise<UserSettings> {
  const stored = await redis.get<UserSettings>(keys.settings(userId));
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function saveSettings(userId: string, settings: UserSettings): Promise<void> {
  await redis.set(keys.settings(userId), settings);
}

export function emptyDayLog(date: string): DayLog {
  return { date, meals: [], burns: [] };
}

export async function getDayLog(userId: string, date: string): Promise<DayLog> {
  const stored = await redis.get<DayLog>(keys.day(userId, date));
  return stored ?? emptyDayLog(date);
}

export async function saveDayLog(userId: string, log: DayLog): Promise<void> {
  await redis.set(keys.day(userId, log.date), log);
}

export async function getLastNDayLogs(userId: string, n: number, timezone: string): Promise<DayLog[]> {
  const dateKeys = lastNDateKeys(n, timezone);
  return Promise.all(dateKeys.map((date) => getDayLog(userId, date)));
}

// Computed on demand (no cron needed): walks backward from yesterday through
// consecutive confirmed food-log days. Capped so it stays cheap on Upstash's free tier.
export async function computeStreak(
  userId: string,
  timezone: string,
  maxLookback = 90
): Promise<number> {
  let streak = 0;
  const today = todayKey(timezone);
  for (let i = 1; i <= maxLookback; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const dateKey = dateKeyFor(d, timezone);
    if (dateKey >= today) continue;
    const log = await getDayLog(userId, dateKey);
    if (foodLogStatus(log) === "complete") {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
