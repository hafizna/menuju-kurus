import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
