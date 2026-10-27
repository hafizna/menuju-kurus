import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { healthPairingOrigin, issueHealthPairing } from "@/lib/healthPairing";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function POST(req: NextRequest) {
  try {
    // Check the signed cookie here too: a client-supplied x-user-id is never
    // sufficient to authorize issuance, even if middleware is bypassed.
    const userId = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const origin = healthPairingOrigin(req);
    if (!origin) return json({ error: "Invalid origin" }, 403);
    return json(await issueHealthPairing(userId, origin));
  } catch {
    return json({ status: "error", code: "storage_unavailable", error: "Koneksi belum dapat disiapkan. Coba lagi sebentar." }, 503);
  }
}
