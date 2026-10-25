import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { getUserById } from "@/lib/users";
import { getSettings } from "@/lib/day";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getSettings(userId);
  const user = getUserById(userId);
  return NextResponse.json({ name: settings.displayName || user?.name || "" });
}
