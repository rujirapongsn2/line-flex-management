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

/**
 * Prefer reply (cheap, uses replyToken). On LINE HTTP 400 (expired/invalid token)
 * fall back to push when userId is available.
 */
export async function replyOrPush(opts: {
  channelAccessToken: string;
  replyToken?: string;
  userId?: string;
  messages: LineMessage[];
}): Promise<LineSendResult> {
  const token = (opts.channelAccessToken || "").trim();
  const replyToken = (opts.replyToken || "").trim();
  const userId = (opts.userId || "").trim();
  const messages = opts.messages;

  if (replyToken) {
    const replied = await sendLineMessages({
      channelAccessToken: token,
      sendMode: "reply",
      replyToken,
      messages,
    });
    if (replied.ok) return replied;
    // Reply token expired / already used / invalid → push
    if (replied.lineStatus === 400 && userId) {
      console.warn(
        "[lineMessaging] reply failed with 400 — falling back to push",
        replied.lineBody
      );
      return sendLineMessages({
        channelAccessToken: token,
        sendMode: "push",
        userId,
        messages,
      });
    }
    return replied;
  }

  if (userId) {
    return sendLineMessages({
      channelAccessToken: token,
      sendMode: "push",
      userId,
      messages,
    });
  }

  return {
    ok: false,
    error: "replyToken or userId is required",
  };
}

/** Show LINE 1:1 loading animation (max 60s per call). No-op on groups. */
export async function startLoadingAnimation(opts: {
  channelAccessToken: string;
  chatId: string;
  loadingSeconds?: number;
}): Promise<boolean> {
  const token = (opts.channelAccessToken || "").trim();
  const chatId = (opts.chatId || "").trim();
  if (!token || !chatId) return false;
  // LINE only accepts user IDs (U…), not group/room
  if (!chatId.startsWith("U")) return false;

  let seconds = opts.loadingSeconds ?? 60;
  if (seconds < 5) seconds = 5;
  if (seconds > 60) seconds = 60;
  // Must be multiple of 5
  seconds = Math.round(seconds / 5) * 5;

  try {
    const res = await fetch("https://api.line.me/v2/bot/chat/loading/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ chatId, loadingSeconds: seconds }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        "[lineMessaging] loading animation failed",
        res.status,
        body.slice(0, 200)
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[lineMessaging] loading animation error", err);
    return false;
  }
}

export type KeepLoadingHandle = {
  /** Stop refreshing before sending the real reply. */
  stop: () => void;
};

/**
 * Keep the 1:1 loading animation alive while LLM work runs.
 * Refreshes every ~50s (LINE max display is 60s), up to ~5 minutes.
 * Call stop() before replyOrPush so the animation clears on the new message.
 */
export function keepLoadingAnimation(opts: {
  channelAccessToken: string;
  chatId: string;
  /** Interval between refreshes in ms (default 50_000). */
  refreshMs?: number;
  /** Max total keep-alive duration in ms (default 300_000 = 5 min). */
  maxMs?: number;
  loadingSeconds?: number;
}): KeepLoadingHandle {
  const refreshMs = opts.refreshMs ?? 50_000;
  const maxMs = opts.maxMs ?? 300_000;
  const loadingSeconds = opts.loadingSeconds ?? 60;
  let stopped = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const startedAt = Date.now();

  const tick = () => {
    if (stopped) return;
    if (Date.now() - startedAt >= maxMs) {
      stop();
      return;
    }
    void startLoadingAnimation({
      channelAccessToken: opts.channelAccessToken,
      chatId: opts.chatId,
      loadingSeconds,
    });
  };

  // Fire immediately, then refresh
  tick();
  intervalId = setInterval(tick, refreshMs);

  function stop() {
    stopped = true;
    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return { stop };
}
