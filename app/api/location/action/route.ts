import { NextRequest, NextResponse } from "next/server";
import {
  allowCheckinRate,
  createCheckin,
  isValidCoords,
  isValidLineUserId,
} from "@/lib/checkinStore";
import { getCheckinSharedSecret } from "@/lib/liffConfig";
import {
  parseLocationActionJson,
  runLocationAction,
} from "@/lib/locationAction";
import { replyAfterLocationAction } from "@/lib/locationReply";
import { sendLineMessages } from "@/lib/lineMessaging";
import { ensureDbReady } from "@/lib/db";
import { readRuntimeConfig } from "@/lib/serverRuntimeConfig";
import { defaultLocationAction } from "@/lib/types";

export const dynamic = "force-dynamic";

type Body = {
  lat?: unknown;
  lng?: unknown;
  lon?: unknown;
  accuracy?: unknown;
  userId?: unknown;
  displayName?: unknown;
  tag?: unknown;
  intent?: unknown;
  query?: unknown;
  limit?: unknown;
  span?: unknown;
  /** Push LINE reply (LLM +/or flex) — default true when userId present */
  pushReply?: unknown;
  pushFlex?: unknown;
  pushOnly?: unknown;
  flex?: unknown;
};

function readSecret(req: NextRequest): string | null {
  return (
    req.headers.get("x-checkin-secret") ||
    req.headers.get("x-poi-secret") ||
    req.headers.get("x-linedev-checkin-secret") ||
    null
  );
}

export async function POST(req: NextRequest) {
  const shared = getCheckinSharedSecret();
  if (shared) {
    const got = (readSecret(req) || "").trim();
    if (got !== shared) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Backward-compat: re-push flex only
  const pushOnly = body.pushOnly === true || body.pushOnly === "true";
  if (pushOnly) {
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const flex = body.flex;
    if (!userId || !isValidLineUserId(userId) || !flex || typeof flex !== "object") {
      return NextResponse.json(
        { ok: false, error: "pushOnly ต้องการ userId + flex" },
        { status: 400 }
      );
    }
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
      messages: [
        flex as {
          type: "flex";
          altText: string;
          contents: Record<string, unknown>;
        },
      ],
    });
    return NextResponse.json({
      ok: result.ok,
      pushed: result.ok,
      error: result.ok ? null : result.error || "push failed",
    });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lonRaw = body.lon ?? body.lng;
  const lon = typeof lonRaw === "number" ? lonRaw : Number(lonRaw);
  const accuracyRaw =
    body.accuracy === null || body.accuracy === undefined
      ? null
      : typeof body.accuracy === "number"
        ? body.accuracy
        : Number(body.accuracy);
  const accuracy =
    accuracyRaw != null && Number.isFinite(accuracyRaw) ? accuracyRaw : null;
  const tagIn = typeof body.tag === "string" ? body.tag : "";
  const intent = typeof body.intent === "string" ? body.intent : "";
  const query = typeof body.query === "string" ? body.query : intent;
  const limit =
    body.limit == null ? undefined : Math.min(20, Math.max(1, Number(body.limit) || 10));
  const span =
    typeof body.span === "string" && body.span.trim()
      ? body.span.trim()
      : undefined;

  if (userId && !isValidLineUserId(userId)) {
    return NextResponse.json(
      { ok: false, error: "userId ไม่ถูกต้อง — ต้องเปิดจาก LINE LIFF" },
      { status: 400 }
    );
  }
  if (!isValidCoords(lat, lon)) {
    return NextResponse.json(
      { ok: false, error: "พิกัด lat/lon ไม่ถูกต้อง" },
      { status: 400 }
    );
  }
  if (userId && !allowCheckinRate(userId)) {
    return NextResponse.json(
      { ok: false, error: "เรียกถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429 }
    );
  }

  const runtime = await readRuntimeConfig();
  const locCfg =
    runtime.line.locationAction ||
    parseLocationActionJson("") ||
    defaultLocationAction();

  let checkinId: string | null = null;
  if (userId) {
    try {
      const prisma = await ensureDbReady();
      const row = await createCheckin(prisma, {
        userId,
        displayName,
        lat,
        lng: lon,
        accuracy,
      });
      checkinId = row.id;
    } catch (err) {
      console.warn("[location/action] persist location failed", err);
    }
  }

  const action = await runLocationAction({
    config: locCfg,
    input: {
      lat,
      lon,
      tag: tagIn,
      intent,
      query,
      userId,
      displayName,
      limit,
      span,
    },
    longdoApiKey: runtime.line.longdoApiKey,
  });

  if (!action.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: action.error,
        mode: action.mode,
        needLongdoKey: action.needLongdoKey || false,
        checkinId,
        actionReady: true,
      },
      {
        status: action.needLongdoKey
          ? 503
          : action.error?.includes("SSRF")
            ? 400
            : 502,
      }
    );
  }

  const wantPush =
    body.pushReply === true ||
    body.pushReply === "true" ||
    body.pushFlex === true ||
    body.pushFlex === "true" ||
    // default: push when userId present unless explicitly false
    (userId &&
      body.pushReply !== false &&
      body.pushReply !== "false" &&
      body.pushFlex !== false &&
      body.pushFlex !== "false");

  let replyMeta: Awaited<ReturnType<typeof replyAfterLocationAction>> | null =
    null;
  if (wantPush && userId) {
    const token = (
      process.env.LINE_CHANNEL_ACCESS_TOKEN ||
      runtime.line.channelAccessToken ||
      ""
    ).trim();
    replyMeta = await replyAfterLocationAction({
      result: action,
      config: locCfg,
      agent: runtime.agent,
      channelAccessToken: token,
      userId,
      displayName,
    });
  }

  return NextResponse.json({
    ok: true,
    actionReady: true,
    mode: action.mode,
    tag: action.tag,
    count: action.count,
    items: action.items,
    // backward compat for LIFF / old clients
    pois: action.items,
    summaryText: action.summaryText,
    flex: action.flex || null,
    checkinId,
    pushed: replyMeta?.pushed ?? false,
    pushError: replyMeta?.pushError ?? null,
    llmUsed: replyMeta?.llmUsed ?? false,
    replyKind: replyMeta?.replyKind ?? "none",
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST { lat, lon|lng, tag?, intent?, query?, limit?, span?, userId?, displayName?, pushReply? }",
    modes: ["longdo_poi", "http", "none"],
    defaults: { mode: "longdo_poi", span: "300m", limit: 10 },
  });
}
