import type { FlexMessage } from "./types";

export type LineMessage =
  | FlexMessage
  | { type: "text"; text: string };

export type LineSendParams = {
  channelAccessToken: string;
  sendMode?: "push" | "reply";
  userId?: string;
  replyToken?: string;
  messages: LineMessage[];
};

export type LineSendResult = {
  ok: boolean;
  error?: string;
  lineStatus?: number;
  lineBody?: unknown;
  meta?: {
    mode: string;
    endpoint: string;
    tokenPreview: string;
  };
};

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

/** Push or reply one or more LINE messages (flex or text). */
export async function sendLineMessages(
  params: LineSendParams
): Promise<LineSendResult> {
  const token = (params.channelAccessToken || "").trim();
  const mode = params.sendMode === "reply" ? "reply" : "push";
  const userId = (params.userId || "").trim();
  const replyToken = (params.replyToken || "").trim();
  const messages = params.messages;

  if (!token) {
    return { ok: false, error: "channelAccessToken is required" };
  }
  if (!messages?.length) {
    return { ok: false, error: "messages are required" };
  }
  if (mode === "push" && !userId) {
    return { ok: false, error: "userId is required for push mode" };
  }
  if (mode === "reply" && !replyToken) {
    return { ok: false, error: "replyToken is required for reply mode" };
  }

  const endpoint =
    mode === "reply"
      ? "https://api.line.me/v2/bot/message/reply"
      : "https://api.line.me/v2/bot/message/push";

  const payload =
    mode === "reply"
      ? { replyToken, messages }
      : { to: userId, messages };

  const meta = {
    mode,
    endpoint,
    tokenPreview: maskToken(token),
  };

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
      return {
        ok: false,
        error: "LINE API error",
        lineStatus: res.status,
        lineBody,
        meta,
      };
    }

    return {
      ok: true,
      lineStatus: res.status,
      lineBody,
      meta,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to call LINE API: ${msg}`,
      meta,
    };
  }
}
