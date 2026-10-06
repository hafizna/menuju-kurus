import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { getSettings } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import {
  BODY_FIELDS,
  BODY_LABELS,
  mergeBodySnapshots,
  validMeasurementDate,
  type BodyField,
  type CheckInField,
} from "@/lib/body";
import {
  getBodyCheckIns,
  upsertBodyCheckIn,
  deleteBodyField,
} from "@/lib/bodyStore";
import {
  getWeightEntries,
  upsertWeightEntry,
  deleteWeightEntry,
  deleteWeightBodyFat,
  computeWeightTrend,
} from "@/lib/weight";

async function result(userId: string) {
  const [settings, weights, checkIns] = await Promise.all([
    getSettings(userId),
    getWeightEntries(userId),
    getBodyCheckIns(userId),
  ]);
  return NextResponse.json({
    snapshots: mergeBodySnapshots(weights, checkIns),
    today: todayKey(settings.timezone),
    profileHeightCm: settings.heightCm,
    weightTrend: computeWeightTrend(weights, settings.timezone),
  });
}
export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return result(userId);
}
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const settings = await getSettings(userId);
  const today = todayKey(settings.timezone);
  const date = body.date ?? today;
  if (!validMeasurementDate(date, today))
    return NextResponse.json(
      { error: "Tanggal harus valid dan tidak di masa depan" },
      { status: 400 },
    );
  const values: Partial<Record<BodyField, number>> = {};
  for (const field of BODY_FIELDS) {
    if (body[field] === undefined) continue;
    const value = body[field];
    const range = BODY_LABELS[field];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < range.min ||
      value > range.max
    ) {
      return NextResponse.json(
        {
          error: `${range.label}: isi angka ${range.min}–${range.max} ${range.unit}`,
        },
        { status: 400 },
      );
    }
    values[field] = Math.round(value * 100) / 100;
  }
  if (!Object.keys(values).length)
    return NextResponse.json(
      { error: "Isi minimal satu ukuran tubuh" },
      { status: 400 },
    );
  if (
    body.heightCm !== undefined &&
    (typeof body.heightCm !== "number" ||
      !Number.isFinite(body.heightCm) ||
      body.heightCm < 120 ||
      body.heightCm > 230)
  ) {
    return NextResponse.json(
      { error: "Tinggi referensi harus 120–230 cm" },
      { status: 400 },
    );
  }
  // Never apply today's profile height retroactively to an earlier measurement.
  const heightCm: number | undefined =
    body.heightCm ??
    (date === today ? (settings.heightCm ?? undefined) : undefined);
  if (values.weightKg !== undefined) {
    await upsertWeightEntry(userId, {
      date,
      weightKg: values.weightKg,
      bodyFat: values.bodyFatPercent,
      heightCm,
    });
  }
  const checkInValues: Partial<Record<CheckInField, number>> = {};
  for (const field of BODY_FIELDS) {
    if (
      field === "weightKg" ||
      (field === "bodyFatPercent" && values.weightKg !== undefined)
    )
      continue;
    if (values[field] !== undefined) checkInValues[field] = values[field];
  }
  if (Object.keys(checkInValues).length)
    await upsertBodyCheckIn(userId, date, checkInValues, "manual", heightCm);
  return result(userId);
}
export async function DELETE(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date");
  const field = req.nextUrl.searchParams.get("field") as BodyField;
  const settings = await getSettings(userId);
  if (
    !validMeasurementDate(date, todayKey(settings.timezone)) ||
    !BODY_FIELDS.includes(field)
  ) {
    return NextResponse.json(
      { error: "Tanggal dan field ukuran yang valid diperlukan" },
      { status: 400 },
    );
  }
  if (field === "weightKg") {
    const weights = await getWeightEntries(userId);
    const entry = weights.find((item) => item.date === date);
    if (entry) await deleteWeightEntry(userId, entry.id);
  } else {
    if (field === "bodyFatPercent") await deleteWeightBodyFat(userId, date);
    await deleteBodyField(userId, date, field);
  }
  return result(userId);
}
