import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { isValidPinFormat, setPin } from "@/lib/pin";

// Not under /api/auth, so middleware requires a valid session here — only
// someone already logged in (via Google, or an existing PIN) can set one.
export async function POST(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pin, confirmPin } = await req.json().catch(() => ({ pin: "", confirmPin: "" }));
  if (!isValidPinFormat(pin)) {
    return NextResponse.json({ error: "PIN harus 6 digit angka" }, { status: 400 });
  }
  if (pin !== confirmPin) {
    return NextResponse.json({ error: "Konfirmasi PIN tidak cocok" }, { status: 400 });
  }

  await setPin(userId, pin);
  return NextResponse.json({ ok: true });
}
