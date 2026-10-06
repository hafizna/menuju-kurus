import { validMeasurementDate, BODY_LABELS } from "@/lib/body";
import { NextRequest, NextResponse } from "next/server";
import {
  getWeightEntries,
  upsertWeightEntry,
  deleteWeightEntry,
  computeWeightTrend,
} from "@/lib/weight";
import { getSettings } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { getUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings(userId);
  const entries = await getWeightEntries(userId);
  const trend = computeWeightTrend(entries, settings.timezone);

  return NextResponse.json({ entries, trend });
}

export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const weightKg = Number(body?.weightKg);
  if (!body || !Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 400) {
    return NextResponse.json(
      { error: "weightKg (0-400) required" },
      { status: 400 },
    );
  }

  const settings = await getSettings(userId);
  const date: string =
    typeof body.date === "string" ? body.date : todayKey(settings.timezone);
  if (!validMeasurementDate(date, todayKey(settings.timezone)))
    return NextResponse.json(
      { error: "Invalid measurement date" },
      { status: 400 },
    );
  const bodyFat =
    body.bodyFat === undefined || body.bodyFat === null || body.bodyFat === ""
      ? undefined
      : Number(body.bodyFat);
  if (
    bodyFat !== undefined &&
    (!Number.isFinite(bodyFat) ||
      bodyFat < BODY_LABELS.bodyFatPercent.min ||
      bodyFat > BODY_LABELS.bodyFatPercent.max)
  )
    return NextResponse.json(
      { error: "Invalid body fat percentage" },
      { status: 400 },
    );
  const note =
    typeof body.note === "string" && body.note ? body.note : undefined;

  const entries = await upsertWeightEntry(userId, {
    date,
    weightKg,
    bodyFat,
    note,
    heightCm:
      date === todayKey(settings.timezone)
        ? (settings.heightCm ?? undefined)
        : undefined,
  });
  const trend = computeWeightTrend(entries, settings.timezone);
  return NextResponse.json({ entries, trend });
}

export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const settings = await getSettings(userId);
  const entries = await deleteWeightEntry(userId, id);
  const trend = computeWeightTrend(entries, settings.timezone);
  return NextResponse.json({ entries, trend });
}
