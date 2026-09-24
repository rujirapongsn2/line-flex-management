import { createHmac, timingSafeEqual } from "crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { runAgentTurn } from "@/lib/llmTools";
import {
  keepLoadingAnimation,
  replyOrPush,
} from "@/lib/lineMessaging";
import { stripMarkdownForLine } from "@/lib/lineText";
import { getDefaultModel } from "@/lib/openrouter";
import { readRuntimeConfig } from "@/lib/serverRuntimeConfig";
import { recordWebhookUser } from "@/lib/webhookStore";
import { detectNearbyIntent } from "@/lib/nearbyIntent";
import {
  buildLocationAskFlex,
  resolveLocationTypeChooserFlex,
} from "@/lib/nearbyFlex";
import { parseLocationActionJson } from "@/lib/locationAction";
import { defaultLocationAction } from "@/lib/types";
import { getEnvLiffId, resolveLiffId } from "@/lib/liffConfig";

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string; id?: string };
};

type LineWebhookBody = {
  destination?: string;
  events?: LineEvent[];
};

function verifySignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const digest = createHmac("sha256", secret).update(body).digest("base64");
  try {
    const a = Buffer.from(digest);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return digest === signature;
  }
}

/**
 * Require signature when:
 * - REQUIRE_LINE_SIGNATURE=1, or
 * - NODE_ENV=production AND ALLOW_UNSIGNED_WEBHOOK is not "1"
 * Dev compose sets ALLOW_UNSIGNED_WEBHOOK=1 so a missing secret still works.
 */
function mustRequireSignature(): boolean {
  if (process.env.REQUIRE_LINE_SIGNATURE === "1") return true;
  if (process.env.REQUIRE_LINE_SIGNATURE === "0") return false;
  if (process.env.ALLOW_UNSIGNED_WEBHOOK === "1") return false;
  return process.env.NODE_ENV === "production";
}

async function replyCheckinAsk(opts: {
  lineToken: string;
  replyToken: string;
  userId?: string;
  tag: string;
  liffId?: string;
}): Promise<boolean> {
  const flex = buildLocationAskFlex({
    liffId: resolveLiffId(opts.liffId) || getEnvLiffId(),
    tag: opts.tag || undefined,
  });
  const result = await replyOrPush({
    channelAccessToken: opts.lineToken,
    replyToken: opts.replyToken,
    userId: opts.userId,
    messages: [flex],
  });
  if (!result.ok) {
    console.error("[webhook] checkin_ask hard-route failed", result);
    return false;
  }
  console.info(
    "[webhook] hard-routed nearby intent → checkin_ask",
    opts.tag ? `tag=${opts.tag}` : "tag=none"
  );
  return true;
}

async function replyLocationTypeChooser(opts: {
  lineToken: string;
  replyToken: string;
  userId?: string;
  liffId?: string;
  endpoints: Array<{ id: string; label?: string }>;
  templateFields?: Record<string, string> | null;
}): Promise<boolean> {
  const flex = resolveLocationTypeChooserFlex({
    liffId: resolveLiffId(opts.liffId) || getEnvLiffId(),
    endpoints: opts.endpoints,
    templateFields: opts.templateFields,
  });
  const result = await replyOrPush({
    channelAccessToken: opts.lineToken,
    replyToken: opts.replyToken,
    userId: opts.userId,
    messages: [flex],
  });
  if (!result.ok) {
    console.error("[webhook] location type chooser failed", result);
    return false;
  }
  console.info(
    "[webhook] hard-routed nearby intent → location_type_chooser",
    `endpoints=${opts.endpoints.map((e) => e.id).join(",")}`,
    opts.templateFields ? "via_template" : "via_builder"
  );
  return true;
}

async function handleTextMessage(event: LineEvent): Promise<void> {
  const userId = event.source?.userId || "";
  const replyToken = event.replyToken || "";
  const text = event.message?.text || "";
  const isOneToOne =
    Boolean(userId) &&
    event.source?.type !== "group" &&
    event.source?.type !== "room";

  if (userId) {
    await recordWebhookUser(userId, text.slice(0, 40));
  }

  const runtime = await readRuntimeConfig();

  const openRouterKey = (
    process.env.OPENROUTER_API_KEY ||
    runtime.agent.apiKey ||
    ""
  ).trim();
  const lineToken = (
    process.env.LINE_CHANNEL_ACCESS_TOKEN ||
    runtime.line.channelAccessToken ||
    ""
  ).trim();
  const model =
    (process.env.OPENROUTER_MODEL || "").trim() ||
    (runtime.agent.model || "").trim() ||
    getDefaultModel();
  const baseUrl = (runtime.agent.baseUrl || "").trim() || undefined;
  const systemExtra = (runtime.agent.prompt || "").trim() || undefined;
  const templates = Array.isArray(runtime.templates) ? runtime.templates : [];

  if (!lineToken || !replyToken) {
    console.warn("[webhook] missing LINE token or replyToken — skip reply");
    return;
  }

  const loading =
    isOneToOne && userId
      ? keepLoadingAnimation({
          channelAccessToken: lineToken,
          chatId: userId,
        })
      : null;

  try {
    // P0: bypass LLM for nearby / check-in / LDD intents
    const nearby = detectNearbyIntent(text);
    if (nearby.matched) {
      const locCfg =
        runtime.line.locationAction ||
        parseLocationActionJson("") ||
        defaultLocationAction();
      const endpoints =
        locCfg.mode === "http" && Array.isArray(locCfg.http?.endpoints)
          ? locCfg.http!.endpoints!.filter((e) => (e.urlTemplate || "").trim())
          : [];
      const tag = (nearby.tag || "").trim().toLowerCase();
      const endpointIds = new Set(endpoints.map((e) => e.id.toLowerCase()));
      const matchTags = new Set(
        endpoints.flatMap((e) =>
          (e.match?.tags || []).map((t) => String(t).toLowerCase())
        )
      );
      const hasTypedEndpoint =
        !!tag && (endpointIds.has(tag) || matchTags.has(tag));

      if (locCfg.mode === "http" && endpoints.length >= 2 && !hasTypedEndpoint) {
        const chooserTpl = templates.find(
          (t) =>
            t.enabled &&
            (t.id === "location_type_chooser" ||
              t.conditionKey === "location_type_chooser")
        );
        loading?.stop();
        await replyLocationTypeChooser({
          lineToken,
          replyToken,
          userId,
          liffId: runtime.line.liffId,
          endpoints: endpoints.map((e) => ({
            id: e.id,
            label: e.label || e.id,
          })),
          templateFields: chooserTpl?.fields || null,
        });
        return;
      }

      loading?.stop();
      await replyCheckinAsk({
        lineToken,
        replyToken,
        userId,
        tag: nearby.tag,
        liffId: runtime.line.liffId,
      });
      return;
    }

    if (!openRouterKey) {
      console.warn(
        "[webhook] OPENROUTER_API_KEY / runtime agent.apiKey missing — skip LLM"
      );
      loading?.stop();
      await replyOrPush({
        channelAccessToken: lineToken,
        replyToken,
        userId,
        messages: [
          {
            type: "text",
            text: "ยังไม่ได้ตั้งค่า API Key บนเซิร์ฟเวอร์ — เปิด Console แล้วกดบันทึก Agent เพื่อซิงก์",
          },
        ],
      });
      return;
    }

    try {
      const turn = await runAgentTurn({
        openRouterKey,
        model,
        baseUrl,
        userText: text,
        systemExtra,
        templates,
      });

      loading?.stop();

      if (turn.flexMessage) {
        const result = await replyOrPush({
          channelAccessToken: lineToken,
          replyToken,
          userId,
          messages: [turn.flexMessage],
        });
        if (!result.ok) {
          console.error("[webhook] flex reply failed", result);
        }
        return;
      }

      const result = await replyOrPush({
        channelAccessToken: lineToken,
        replyToken,
        userId,
        messages: [
          {
            type: "text",
            text: stripMarkdownForLine(
              turn.assistantText || "รับข้อความแล้วครับ"
            ),
          },
        ],
      });
      if (!result.ok) {
        console.error("[webhook] text reply failed", result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[webhook] agent error", msg);
      const lower = msg.toLowerCase();
      const isUpstream =
        /sdp-ai-generator|chat-messages|internal server error|econnrefused|etimedout|fetch failed|llm http|llm_timeout|llm request timed out|certificate|genai connection|timed out after/i.test(
          msg
        ) || lower.includes("server error");
      const userText = isUpstream
        ? "ขออภัยครับ ระบบตอบคำถามความรู้ยังเชื่อมต่อ GenAI ไม่สำเร็จในขณะนี้ กรุณาลองใหม่ภายหลัง หรือแจ้งผู้ดูแล Softnix GenAI"
        : `ขออภัย มีข้อผิดพลาด: ${msg.slice(0, 120)}`;
      loading?.stop();
      try {
        await replyOrPush({
          channelAccessToken: lineToken,
          replyToken,
          userId,
          messages: [{ type: "text", text: userText }],
        });
      } catch {
        /* ignore */
      }
    }
  } finally {
    loading?.stop();
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const runtime = await readRuntimeConfig();
  const secret = (
    process.env.LINE_CHANNEL_SECRET ||
    runtime.line.channelSecret ||
    ""
  ).trim();
  const signature = req.headers.get("x-line-signature");

  if (secret) {
    if (!verifySignature(rawBody, signature, secret)) {
      return NextResponse.json(
        { ok: false, error: "Invalid signature" },
        { status: 401 }
      );
    }
  } else if (mustRequireSignature()) {
    console.error(
      "[webhook] channel secret missing — rejecting (set LINE_CHANNEL_SECRET / runtime secret, or ALLOW_UNSIGNED_WEBHOOK=1 for dev)"
    );
    return NextResponse.json(
      { ok: false, error: "LINE channel secret required" },
      { status: 401 }
    );
  } else {
    console.warn(
      "[webhook] LINE_CHANNEL_SECRET / runtime channelSecret not set — accepting without signature (dev mode)"
    );
  }

  let body: LineWebhookBody;
  try {
    body = rawBody ? (JSON.parse(rawBody) as LineWebhookBody) : { events: [] };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const events = body.events || [];
  const textEvents: LineEvent[] = [];

  for (const event of events) {
    if (event.source?.userId) {
      void recordWebhookUser(
        event.source.userId,
        event.type === "message" && event.message?.type === "text"
          ? (event.message.text || "").slice(0, 40)
          : event.type || ""
      );
    }

    if (
      event.type === "message" &&
      event.message?.type === "text" &&
      event.replyToken
    ) {
      textEvents.push(event);
    }
  }

  // Return 200 immediately; process LLM / replies in after() (Next ≥ 15.1)
  // Avoids LINE HTTP 499 when LLM is slow.
  if (textEvents.length > 0) {
    after(async () => {
      for (const event of textEvents) {
        try {
          await handleTextMessage(event);
        } catch (err) {
          console.error("[webhook] after() handleTextMessage error", err);
        }
      }
    });
  }

  return NextResponse.json({ ok: true });
}

/** Health / verify URL for LINE console */
export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "LINE webhook endpoint. POST events here.",
  });
}
