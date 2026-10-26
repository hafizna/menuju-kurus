import { NextRequest, NextResponse } from "next/server";
import { HealthPairingInvalid, healthPairingOrigin, redeemHealthPairing } from "@/lib/healthPairing";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
const invalid = (status = 400) => json({ status: "error", code: "pairing_invalid", error: "Tautan koneksi sudah tidak berlaku. Hubungkan lagi dari Slothly." }, status);

export async function POST(req: NextRequest) {
  const origin = healthPairingOrigin(req);
  if (!origin) return invalid();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.code !== "string") return invalid();
  try {
    return json(await redeemHealthPairing(body.code, origin));
  } catch (error) {
    if (error instanceof HealthPairingInvalid) return invalid(410);
    // Never return the supplied code, bearer, storage URL, or exception text.
    return json({ status: "error", code: "storage_unavailable", error: "Koneksi belum dapat disimpan. Coba lagi sebentar." }, 503);
  }
}
