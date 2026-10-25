import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { getUserById } from "@/lib/users";
import { getHealthConnection, issueHealthToken, revokeHealthToken } from "@/lib/healthConnection";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

function userId(req: NextRequest) {
  const id = getUserId(req);
  return id && getUserById(id) ? id : null;
}

export async function GET(req: NextRequest) {
  const id = userId(req);
  if (!id) return json({ error: "Unauthorized" }, 401);
  return json(await getHealthConnection(id));
}

export async function POST(req: NextRequest) {
  const id = userId(req);
  if (!id) return json({ error: "Unauthorized" }, 401);
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Invalid origin" }, 403);
  return json(await issueHealthToken(id));
}

export async function DELETE(req: NextRequest) {
  const id = userId(req);
  if (!id) return json({ error: "Unauthorized" }, 401);
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Invalid origin" }, 403);
  return json(await revokeHealthToken(id));
}
