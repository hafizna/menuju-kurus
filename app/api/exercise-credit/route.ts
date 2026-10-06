import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/session";

// Retain the URL for older clients, but never prescribe exercise to offset food.
export async function GET(req: NextRequest) {
  if (!getUserId(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    suggestions: [],
    message: "Aktivitas tidak perlu menebus makanan dan tidak menambah budget makan.",
  });
}
