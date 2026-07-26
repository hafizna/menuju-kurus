import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

export const keys = {
  day: (date: string) => `mk:day:${date}`,
  settings: "mk:settings",
  streak: "mk:streak",
};
