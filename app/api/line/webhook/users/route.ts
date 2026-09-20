import { NextRequest, NextResponse } from "next/server";
import { listWebhookUsers } from "@/lib/webhookStore";
import { isAuthError, requireAuth } from "@/lib/requireAuth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const users = await listWebhookUsers();
  return NextResponse.json({
    ok: true,
    users,
  });
}
