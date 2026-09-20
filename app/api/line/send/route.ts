import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/requireAuth";

type SendBody = {
  channelAccessToken?: string;
  sendMode?: "push" | "reply";
  userId?: string;
  replyToken?: string;
  message?: {
    type: "flex";
    altText: string;
    contents: Record<string, unknown>;
  };
};

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const token = (body.channelAccessToken || "").trim();
  const mode = body.sendMode === "reply" ? "reply" : "push";
  const userId = (body.userId || "").trim();
  const replyToken = (body.replyToken || "").trim();
  const message = body.message;

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "channelAccessToken is required" },
      { status: 400 }
    );
  }
  if (!message || message.type !== "flex" || !message.contents) {
    return NextResponse.json(
      { ok: false, error: "message must be a flex message with contents" },
      { status: 400 }
    );
  }
  if (!message.altText?.trim()) {
    return NextResponse.json(
      { ok: false, error: "altText is required" },
      { status: 400 }
    );
  }
  if (mode === "push" && !userId) {
    return NextResponse.json(
      { ok: false, error: "userId is required for push mode" },
      { status: 400 }
    );
  }
  if (mode === "reply" && !replyToken) {
    return NextResponse.json(
      { ok: false, error: "replyToken is required for reply mode" },
      { status: 400 }
    );
  }

  const endpoint =
    mode === "reply"
      ? "https://api.line.me/v2/bot/message/reply"
      : "https://api.line.me/v2/bot/message/push";

  const payload =
    mode === "reply"
      ? { replyToken, messages: [message] }
      : { to: userId, messages: [message] };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let lineBody: unknown = null;
    try {
      lineBody = text ? JSON.parse(text) : null;
    } catch {
      lineBody = text;
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "LINE API error",
          lineStatus: res.status,
          lineBody,
          meta: { mode, endpoint, tokenPreview: maskToken(token) },
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      lineStatus: res.status,
      lineBody,
      meta: { mode, endpoint, tokenPreview: maskToken(token) },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: `Failed to call LINE API: ${msg}`,
        meta: { mode, endpoint, tokenPreview: maskToken(token) },
      },
      { status: 502 }
    );
  }
}
