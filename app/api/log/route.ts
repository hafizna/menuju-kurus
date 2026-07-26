import { NextRequest, NextResponse } from "next/server";
import { getDayLog, saveDayLog, getSettings } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { BurnEntry, MealEntry } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || (body.type !== "meal" && body.type !== "burn")) {
    return NextResponse.json({ error: "type must be 'meal' or 'burn'" }, { status: 400 });
  }

  const settings = await getSettings();
  const date: string = typeof body.date === "string" ? body.date : todayKey(settings.timezone);
  const log = await getDayLog(date);

  if (body.type === "meal") {
    const entry: MealEntry = {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      foodName: String(body.foodName ?? "Makanan"),
      calories: Math.max(0, Math.round(Number(body.calories) || 0)),
      protein_g: Math.max(0, Math.round(Number(body.protein_g) || 0)),
      carbs_g: Math.max(0, Math.round(Number(body.carbs_g) || 0)),
      fat_g: Math.max(0, Math.round(Number(body.fat_g) || 0)),
      portionNote: typeof body.portionNote === "string" ? body.portionNote : undefined,
      source: body.source === "photo" ? "photo" : "manual",
    };
    log.meals.push(entry);
  } else {
    const entry: BurnEntry = {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      calories: Math.max(0, Math.round(Number(body.calories) || 0)),
      label: String(body.label ?? "Aktivitas"),
      source: body.source === "shortcuts" ? "shortcuts" : "manual",
    };
    log.burns.push(entry);
  }

  await saveDayLog(log);
  return NextResponse.json({ log });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");
  const settings = await getSettings();
  const date = searchParams.get("date") || todayKey(settings.timezone);

  if (!id || (type !== "meal" && type !== "burn")) {
    return NextResponse.json({ error: "type and id required" }, { status: 400 });
  }

  const log = await getDayLog(date);
  if (type === "meal") {
    log.meals = log.meals.filter((m) => m.id !== id);
  } else {
    log.burns = log.burns.filter((b) => b.id !== id);
  }
  await saveDayLog(log);
  return NextResponse.json({ log });
}
