import { redis, keys } from "./redis";
import { DayLog, DEFAULT_SETTINGS, UserSettings } from "./types";
import { dateKeyFor, todayKey, lastNDateKeys } from "./dates";

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

export interface DaySummary {
  caloriesIn: number;
  caloriesOut: number;
  net: number;
  target: number;
  remaining: number;
  onTrack: boolean;
}

export function summarizeDay(log: DayLog, target: number): DaySummary {
  const caloriesIn = log.meals.reduce((s, m) => s + m.calories, 0);
  const caloriesOut = log.burns.reduce((s, b) => s + b.calories, 0);
  const net = caloriesIn - caloriesOut;
  return {
    caloriesIn,
    caloriesOut,
    net,
    target,
    remaining: target - net,
    onTrack: net <= target,
  };
}

export async function getLastNDayLogs(userId: string, n: number, timezone: string): Promise<DayLog[]> {
  const dateKeys = lastNDateKeys(n, timezone);
  return Promise.all(dateKeys.map((date) => getDayLog(userId, date)));
}

export interface WeeklyBudget {
  weeklyTarget: number;
  consumed: number;
  remaining: number;
}

// Rolling 7-day window (today + previous 6 days), not calendar-week, to match
// how the weight trend engine already looks at "last 7 days".
export function computeWeeklyBudget(logs: DayLog[], dailyTarget: number): WeeklyBudget {
  const weeklyTarget = dailyTarget * 7;
  const consumed = logs.reduce((sum, log) => sum + summarizeDay(log, dailyTarget).net, 0);
  return { weeklyTarget, consumed, remaining: weeklyTarget - consumed };
}

function isDaySuccess(log: DayLog, target: number): boolean {
  if (log.meals.length === 0) return false;
  return summarizeDay(log, target).onTrack;
}

// Computed on demand (no cron needed): walks backward from yesterday through
// consecutive successful days. Capped so it stays cheap on Upstash's free tier.
export async function computeStreak(
  userId: string,
  timezone: string,
  target: number,
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
    if (isDaySuccess(log, target)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
