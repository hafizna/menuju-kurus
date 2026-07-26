import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

export const keys = {
  day: (userId: string, date: string) => `mk:${userId}:day:${date}`,
  settings: (userId: string) => `mk:${userId}:settings`,
  weight: (userId: string) => `mk:${userId}:weight`,
  weeklySummary: (userId: string) => `mk:${userId}:weeklySummary`,
};
