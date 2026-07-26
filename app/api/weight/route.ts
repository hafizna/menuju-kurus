import { NextRequest, NextResponse } from "next/server";
import { getWeightEntries, upsertWeightEntry, deleteWeightEntry, computeWeightTrend } from "@/lib/weight";
import { getSettings } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { getUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  const entries = await getWeightEntries(userId);
  const trend = computeWeightTrend(entries, settings.timezone);

  return NextResponse.json({ entries, trend });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const weightKg = Number(body?.weightKg);
  if (!body || !Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 400) {
    return NextResponse.json({ error: "weightKg (0-400) required" }, { status: 400 });
  }

  const settings = await getSettings(userId);
  const date: string = typeof body.date === "string" ? body.date : todayKey(settings.timezone);
  const bodyFat = Number.isFinite(Number(body.bodyFat)) && body.bodyFat !== "" ? Number(body.bodyFat) : undefined;
  const note = typeof body.note === "string" && body.note ? body.note : undefined;

  const entries = await upsertWeightEntry(userId, { date, weightKg, bodyFat, note });
  const trend = computeWeightTrend(entries, settings.timezone);
  return NextResponse.json({ entries, trend });
}

export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const settings = await getSettings(userId);
  const entries = await deleteWeightEntry(userId, id);
  const trend = computeWeightTrend(entries, settings.timezone);
  return NextResponse.json({ entries, trend });
}
