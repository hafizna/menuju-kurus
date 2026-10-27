import { NextRequest, NextResponse } from "next/server";
import { getDayLog, saveDayLog, getSettings } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { BurnEntry, MealEntry } from "@/lib/types";
import { getUserId } from "@/lib/session";
import { parseSugarInput } from "@/lib/sugar";
import { MAX_ACTIVITY_KCAL, validDurationMin } from "@/lib/activity";

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || (body.type !== "meal" && body.type !== "burn")) {
    return NextResponse.json({ error: "type must be 'meal' or 'burn'" }, { status: 400 });
  }

  const settings = await getSettings(userId);
  const date: string = typeof body.date === "string" ? body.date : todayKey(settings.timezone);
  const log = await getDayLog(userId, date);

  let savedEntry: MealEntry | BurnEntry | undefined;

  if (body.type === "meal") {
    // Optional: when the meal was actually eaten (forgot to log it earlier).
    // Must be a real instant, not in the future, and not older than a day.
    let eatenAt = new Date().toISOString();
    if (body.time !== undefined) {
      const parsed = typeof body.time === "string" ? Date.parse(body.time) : NaN;
      const now = Date.now();
      if (!Number.isFinite(parsed) || parsed > now + 5 * 60_000 || parsed < now - 36 * 3_600_000) {
        return NextResponse.json({ error: "Jam makannya belum masuk akal. Pilih jam yang sudah lewat." }, { status: 400 });
      }
      eatenAt = new Date(parsed).toISOString();
    }
    const entry: MealEntry = {
      id: crypto.randomUUID(),
      time: eatenAt,
      foodName: String(body.foodName ?? "Makanan"),
      calories: Math.max(0, Math.round(Number(body.calories) || 0)),
      protein_g: Math.max(0, Math.round(Number(body.protein_g) || 0)),
      carbs_g: Math.max(0, Math.round(Number(body.carbs_g) || 0)),
      fat_g: Math.max(0, Math.round(Number(body.fat_g) || 0)),
      sugar_g: parseSugarInput(body.sugar_g),
      portionNote: typeof body.portionNote === "string" ? body.portionNote : undefined,
      source: body.source === "photo" ? "photo" : "manual",
    };
    log.meals.push(entry);
    log.foodLogComplete = false;
    savedEntry = entry;
  } else {
    // Duration is optional, but when sent it must be a believable number of minutes.
    if (body.durationMin !== undefined && !validDurationMin(body.durationMin)) {
      return NextResponse.json({ error: "Durasi aktivitas belum masuk akal. Isi 1 sampai 720 menit." }, { status: 400 });
    }
    const calories = Math.max(0, Math.round(Number(body.calories) || 0));
    if (calories > MAX_ACTIVITY_KCAL) {
      return NextResponse.json({ error: `Estimasi aktivitas terlalu besar. Isi sampai ${MAX_ACTIVITY_KCAL} kcal.` }, { status: 400 });
    }
    const entry: BurnEntry = {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      calories,
      label: String(body.label ?? "Aktivitas"),
      ...(body.durationMin === undefined ? {} : { durationMin: body.durationMin }),
      source: body.source === "shortcuts" ? "shortcuts" : "manual",
    };
    log.burns.push(entry);
    savedEntry = entry;
  }

  await saveDayLog(userId, log);
  return NextResponse.json({ log, entry: savedEntry });
}

export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");
  const settings = await getSettings(userId);
  const date = searchParams.get("date") || todayKey(settings.timezone);

  if (!id || (type !== "meal" && type !== "burn")) {
    return NextResponse.json({ error: "type and id required" }, { status: 400 });
  }

  const log = await getDayLog(userId, date);
  if (type === "meal") {
    log.meals = log.meals.filter((m) => m.id !== id);
    log.foodLogComplete = false;
  } else {
    log.burns = log.burns.filter((b) => b.id !== id);
  }
  await saveDayLog(userId, log);
  return NextResponse.json({ log });
}

// Confirmation concerns food intake only; changing activity does not reopen it.
export async function PATCH(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.foodLogComplete !== "boolean") {
    return NextResponse.json({ error: "foodLogComplete must be a boolean" }, { status: 400 });
  }
  const settings = await getSettings(userId);
  const today = todayKey(settings.timezone);
  const date = body.date === undefined ? today : body.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > today) {
    return NextResponse.json({ error: "date must be a valid day, not in the future" }, { status: 400 });
  }
  const log = await getDayLog(userId, date);
  log.foodLogComplete = body.foodLogComplete;
  await saveDayLog(userId, log);
  return NextResponse.json({ log });
}
