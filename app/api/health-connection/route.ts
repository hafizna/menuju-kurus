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

function sameOrigin(req: NextRequest) {
  const value = req.headers.get("origin");
  if (!value) return true;
  try {
    const origin = new URL(value);
    // Next may normalize nextUrl to its listening hostname (localhost), while
    // Host retains the browser-facing address. Use that host and the protocol
    // supplied by the deployment proxy when comparing browser mutations.
    const host = (req.headers.get("host") ?? req.nextUrl.host).toLowerCase();
    const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.nextUrl.protocol.slice(0, -1);
    return ["http", "https"].includes(protocol) && origin.host === host && origin.protocol === `${protocol}:`;
  } catch { return false; }
}

export async function GET(req: NextRequest) {
  const id = userId(req);
  if (!id) return json({ error: "Unauthorized" }, 401);
  return json(await getHealthConnection(id));
}

export async function POST(req: NextRequest) {
  const id = userId(req);
  if (!id) return json({ error: "Unauthorized" }, 401);
  if (!sameOrigin(req)) return json({ error: "Invalid origin" }, 403);
  return json(await issueHealthToken(id));
}

export async function DELETE(req: NextRequest) {
  const id = userId(req);
  if (!id) return json({ error: "Unauthorized" }, 401);
  if (!sameOrigin(req)) return json({ error: "Invalid origin" }, 403);
  return json(await revokeHealthToken(id));
}
