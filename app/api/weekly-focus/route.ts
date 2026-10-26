import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/day";
import { todayKey } from "@/lib/dates";
import { redis } from "@/lib/redis";
import { getUserId } from "@/lib/session";
import { createWeeklyFocus, findWeeklyFocus, type WeeklyFocus } from "@/lib/weeklyFocus";

const focusKey = (userId: string) => `mk:${userId}:weekly-focus:v1`;
async function response(userId: string, today: string) {
  const focus = await redis.get<WeeklyFocus>(focusKey(userId));
  return NextResponse.json({ focus: focus ?? null, today, reviewDue: !!focus && today >= focus.reviewOn });
}
export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getSettings(userId);
  return response(userId, todayKey(settings.timezone));
}
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  const settings = await getSettings(userId);
  const today = todayKey(settings.timezone);
  if (body.action === "select") {
    const option = findWeeklyFocus(body.id);
    if (!option) return NextResponse.json({ error: "Pilih fokus yang tersedia." }, { status: 400 });
    await redis.set(focusKey(userId), createWeeklyFocus(option.id, today));
  } else if (body.action === "complete") {
    const focus = await redis.get<WeeklyFocus>(focusKey(userId));
    if (!focus) return NextResponse.json({ error: "Belum ada fokus yang dipilih." }, { status: 409 });
    if (body.id !== focus.id) return NextResponse.json({ error: "Fokus berubah. Muat ulang sebelum menandai tercapai." }, { status: 409 });
    await redis.set(focusKey(userId), { ...focus, completedOn: focus.completedOn ?? today });
  } else return NextResponse.json({ error: "Tindakan tidak valid." }, { status: 400 });
  return response(userId, today);
}
