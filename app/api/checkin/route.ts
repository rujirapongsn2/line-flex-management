import { NextRequest, NextResponse } from "next/server";
import {
  allowCheckinRate,
  createCheckin,
  isValidCoords,
  isValidLineUserId,
} from "@/lib/checkinStore";
import { buildCheckinResultFlex } from "@/lib/checkinFlex";
import { getCheckinSharedSecret } from "@/lib/liffConfig";
import { sendLineMessages } from "@/lib/lineMessaging";
import { ensureDbReady } from "@/lib/db";
import { readRuntimeConfig } from "@/lib/serverRuntimeConfig";

export const dynamic = "force-dynamic";

type Body = {
  lat?: unknown;
  lng?: unknown;
  accuracy?: unknown;
  userId?: unknown;
  displayName?: unknown;
  /** Client could not liff.sendMessages — ask server to push */
  pushFlex?: unknown;
  /** Re-push flex for an existing check-in (no new row) */
  pushOnly?: unknown;
  checkinId?: unknown;
};

function readSecret(req: NextRequest): string | null {
  return (
    req.headers.get("x-checkin-secret") ||
    req.headers.get("x-linedev-checkin-secret") ||
    null
  );
}

export async function POST(req: NextRequest) {
  const shared = getCheckinSharedSecret();
  if (shared) {
    const got = (readSecret(req) || "").trim();
    if (got !== shared) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  const accuracyRaw =
    body.accuracy === null || body.accuracy === undefined
      ? null
      : typeof body.accuracy === "number"
        ? body.accuracy
        : Number(body.accuracy);
  const accuracy =
    accuracyRaw != null && Number.isFinite(accuracyRaw) ? accuracyRaw : null;
  const wantPush = body.pushFlex === true || body.pushFlex === "true";
  const pushOnly = body.pushOnly === true || body.pushOnly === "true";
  const checkinId =
    typeof body.checkinId === "string" ? body.checkinId.trim() : "";

  if (pushOnly) {
    if (!userId || !isValidLineUserId(userId) || !checkinId) {
      return NextResponse.json(
        { ok: false, error: "pushOnly ต้องการ userId + checkinId" },
        { status: 400 }
      );
    }
    try {
      const prisma = await ensureDbReady();
      const row = await prisma.checkIn.findUnique({ where: { id: checkinId } });
      if (!row || row.userId !== userId) {
        return NextResponse.json(
          { ok: false, error: "ไม่พบรายการเช็คอิน" },
          { status: 404 }
        );
      }
      const flex = buildCheckinResultFlex({
        lat: row.lat,
        lng: row.lng,
        accuracy: row.accuracy,
        displayName: row.displayName,
        checkedAt: row.createdAt,
      });
      const runtime = await readRuntimeConfig();
      const token = (
        process.env.LINE_CHANNEL_ACCESS_TOKEN ||
        runtime.line.channelAccessToken ||
        ""
      ).trim();
      if (!token) {
        return NextResponse.json(
          { ok: false, error: "ไม่มี LINE token สำหรับ push" },
          { status: 500 }
        );
      }
      const result = await sendLineMessages({
        channelAccessToken: token,
        sendMode: "push",
        userId,
        messages: [flex],
      });
      return NextResponse.json({
        ok: result.ok,
        pushed: result.ok,
        flex,
        error: result.ok ? null : result.error || "push failed",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[checkin] pushOnly error", msg);
      return NextResponse.json(
        { ok: false, error: "push ไม่สำเร็จ" },
        { status: 500 }
      );
    }
  }

  if (!userId || !isValidLineUserId(userId)) {
    return NextResponse.json(
      {
        ok: false,
        error: "userId ไม่ถูกต้อง — ต้องเปิดจาก LINE LIFF",
      },
      { status: 400 }
    );
  }
  if (!isValidCoords(lat, lng)) {
    return NextResponse.json(
      { ok: false, error: "พิกัด lat/lng ไม่ถูกต้อง" },
      { status: 400 }
    );
  }
  if (!allowCheckinRate(userId)) {
    return NextResponse.json(
      {
        ok: false,
        error: "เช็คอินถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
      },
      { status: 429 }
    );
  }

  try {
    const prisma = await ensureDbReady();
    const row = await createCheckin(prisma, {
      userId,
      displayName,
      lat,
      lng,
      accuracy,
    });

    const flex = buildCheckinResultFlex({
      lat: row.lat,
      lng: row.lng,
      accuracy: row.accuracy,
      displayName: row.displayName,
      checkedAt: row.createdAt,
    });

    let pushed = false;
    let pushError: string | undefined;
    if (wantPush) {
      const runtime = await readRuntimeConfig();
      const token = (
        process.env.LINE_CHANNEL_ACCESS_TOKEN ||
        runtime.line.channelAccessToken ||
        ""
      ).trim();
      if (token) {
        const result = await sendLineMessages({
          channelAccessToken: token,
          sendMode: "push",
          userId,
          messages: [flex],
        });
        pushed = result.ok;
        if (!result.ok) {
          pushError = result.error || "push failed";
          console.warn("[checkin] push flex failed", result);
        }
      } else {
        pushError = "no LINE token";
      }
    }

    return NextResponse.json({
      ok: true,
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      flex,
      pushed,
      pushError: pushError || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[checkin] error", msg);
    return NextResponse.json(
      { ok: false, error: "บันทึกเช็คอินไม่สำเร็จ" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST { lat, lng, accuracy?, userId, displayName?, pushFlex? }",
  });
}
