import { NextRequest, NextResponse } from "next/server";
import { runAgentTurn } from "@/lib/llmTools";
import { sendLineMessages } from "@/lib/lineMessaging";
import { getDefaultModel } from "@/lib/openrouter";
import type { ConsoleTemplate } from "@/lib/types";
import { isAuthError, requireAuth } from "@/lib/requireAuth";

type ChatBody = {
  openRouterApiKey?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  message?: string;
  systemPrompt?: string;
  templates?: ConsoleTemplate[];
  channelAccessToken?: string;
  userId?: string;
  sendToLine?: boolean;
  sendMode?: "push" | "reply";
  replyToken?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const openRouterApiKey = (
    body.openRouterApiKey ||
    body.apiKey ||
    ""
  ).trim();
  const message = (body.message || "").trim();
  const model = (body.model || getDefaultModel()).trim();
  const baseUrl = (body.baseUrl || "").trim() || undefined;

  if (!openRouterApiKey) {
    return NextResponse.json(
      { ok: false, error: "apiKey / openRouterApiKey is required" },
      { status: 400 }
    );
  }
  if (!message) {
    return NextResponse.json(
      { ok: false, error: "message is required" },
      { status: 400 }
    );
  }

  try {
    const turn = await runAgentTurn({
      openRouterKey: openRouterApiKey,
      model,
      baseUrl,
      userText: message,
      systemExtra: body.systemPrompt?.trim() || undefined,
      templates: Array.isArray(body.templates) ? body.templates : [],
    });

    let lineSend: Awaited<ReturnType<typeof sendLineMessages>> | null = null;

    if (body.sendToLine) {
      const token = (body.channelAccessToken || "").trim();
      const mode = body.sendMode === "reply" ? "reply" : "push";
      const userId = (body.userId || "").trim();
      const replyToken = (body.replyToken || "").trim();

      if (turn.flexMessage) {
        lineSend = await sendLineMessages({
          channelAccessToken: token,
          sendMode: mode,
          userId,
          replyToken,
          messages: [turn.flexMessage],
        });
      } else if (turn.assistantText) {
        lineSend = await sendLineMessages({
          channelAccessToken: token,
          sendMode: mode,
          userId,
          replyToken,
          messages: [{ type: "text", text: turn.assistantText }],
        });
      } else {
        lineSend = {
          ok: false,
          error: "No flex or text content to send to LINE",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      assistantText: turn.assistantText,
      flex: turn.flexMessage ?? null,
      conditionKey: turn.conditionKey ?? null,
      toolTrace: turn.toolTrace,
      lineSend,
      raw: turn.raw,
    });
  } catch (err) {
    const e = err as Error & { status?: number; body?: unknown };
    const status =
      typeof e.status === "number" && e.status >= 400 && e.status < 600
        ? e.status
        : 502;
    return NextResponse.json(
      {
        ok: false,
        error: e.message || "LLM request failed",
        openRouterStatus: e.status,
        openRouterBody: e.body,
      },
      { status }
    );
  }
}
