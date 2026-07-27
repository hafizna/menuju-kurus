import { NextRequest, NextResponse } from "next/server";
import { getDayLog, saveDayLog, getSettings, saveSettings } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { getUsers } from "@/lib/users";
import { upsertWeightEntry } from "@/lib/weight";

function numberOrUndefined(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Called by an Apple Shortcuts personal automation (see README) that reads
// from the Health app and POSTs a combined snapshot here. Each user has
// their own bearer token. Every field is optional and independently
// upserted — Shortcuts sends whatever it could read this run (e.g. no
// Apple Watch means no VO2 max / resting heart rate), so a field missing
// from one sync must not clobber a value obtained on a previous sync.
// Active Energy and weight/body fat overwrite the day's single synced
// entry rather than accumulating; VO2 max / resting HR / cardio minutes
// overwrite the corresponding settings field directly. No value is ever
// summed across syncs.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");

  const user = getUsers().find((u) => u.healthSyncToken && u.healthSyncToken === token);
  if (!token || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const calories = numberOrUndefined(body.calories);
  const weightKg = numberOrUndefined(body.weightKg);
  const bodyFatPercent = numberOrUndefined(body.bodyFatPercent);
  const vo2Max = numberOrUndefined(body.vo2Max);
  const restingHeartRate = numberOrUndefined(body.restingHeartRate);
  const cardioMinutesWeekly = numberOrUndefined(body.cardioMinutesWeekly);

  const hasAnyField =
    calories !== undefined ||
    weightKg !== undefined ||
    vo2Max !== undefined ||
    restingHeartRate !== undefined ||
    cardioMinutesWeekly !== undefined;

  if (!hasAnyField) {
    return NextResponse.json(
      { error: "Provide at least one of: calories, weightKg, vo2Max, restingHeartRate, cardioMinutesWeekly" },
      { status: 400 }
    );
  }

  const settings = await getSettings(user.id);
  const date: string = typeof body.date === "string" ? body.date : todayKey(settings.timezone);

  if (calories !== undefined && calories > 0) {
    const log = await getDayLog(user.id, date);
    const existing = log.burns.find((b) => b.source === "shortcuts");
    if (existing) {
      existing.calories = Math.round(calories);
      existing.time = new Date().toISOString();
    } else {
      log.burns.push({
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        calories: Math.round(calories),
        label: "Active Energy (Apple Health)",
        source: "shortcuts",
      });
    }
    await saveDayLog(user.id, log);
  }

  if (weightKg !== undefined && weightKg > 0) {
    await upsertWeightEntry(user.id, {
      date,
      weightKg,
      bodyFat: bodyFatPercent,
      source: "shortcuts",
    });
  }

  const settingsPatch: Partial<typeof settings> = {};
  if (vo2Max !== undefined) settingsPatch.vo2Max = Math.min(90, Math.max(10, vo2Max));
  if (restingHeartRate !== undefined) settingsPatch.restingHeartRate = Math.min(140, Math.max(30, restingHeartRate));
  if (cardioMinutesWeekly !== undefined) {
    settingsPatch.cardioMinutesWeekly = Math.min(1000, Math.max(0, Math.round(cardioMinutesWeekly)));
  }
  if (Object.keys(settingsPatch).length > 0) {
    await saveSettings(user.id, { ...settings, ...settingsPatch });
  }

  return NextResponse.json({
    ok: true,
    synced: {
      calories: calories !== undefined && calories > 0,
      weightKg: weightKg !== undefined && weightKg > 0,
      bodyFatPercent: bodyFatPercent !== undefined && weightKg !== undefined && weightKg > 0,
      vo2Max: vo2Max !== undefined,
      restingHeartRate: restingHeartRate !== undefined,
      cardioMinutesWeekly: cardioMinutesWeekly !== undefined,
    },
  });
}
