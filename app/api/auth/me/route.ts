import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  ensureAuthStore,
  verifySession,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  await ensureAuthStore();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  return NextResponse.json({ ok: true, username: session.username });
}
