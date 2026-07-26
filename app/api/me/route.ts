import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { getUserById } from "@/lib/users";

export async function GET(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = getUserById(userId);
  return NextResponse.json({ name: user?.name ?? "" });
}
