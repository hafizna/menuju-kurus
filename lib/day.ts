import { redis, keys } from "./redis";
import { DayLog, DEFAULT_SETTINGS, UserSettings } from "./types";
import { dateKeyFor, todayKey } from "./dates";

export async function getSettings(): Promise<UserSettings> {
  const stored = await redis.get<UserSettings>(keys.settings);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await redis.set(keys.settings, settings);
}

export function emptyDayLog(date: string): DayLog {
  return { date, meals: [], burns: [] };
}

export async function getDayLog(date: string): Promise<DayLog> {
  const stored = await redis.get<DayLog>(keys.day(date));
  return stored ?? emptyDayLog(date);
}

export async function saveDayLog(log: DayLog): Promise<void> {
  await redis.set(keys.day(log.date), log);
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

function isDaySuccess(log: DayLog, target: number): boolean {
  if (log.meals.length === 0) return false;
  return summarizeDay(log, target).onTrack;
}

// Computed on demand (no cron needed): walks backward from yesterday through
// consecutive successful days. Capped so it stays cheap on Upstash's free tier.
export async function computeStreak(timezone: string, target: number, maxLookback = 90): Promise<number> {
  let streak = 0;
  const today = todayKey(timezone);
  for (let i = 1; i <= maxLookback; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const dateKey = dateKeyFor(d, timezone);
    if (dateKey >= today) continue;
    const log = await getDayLog(dateKey);
    if (isDaySuccess(log, target)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
