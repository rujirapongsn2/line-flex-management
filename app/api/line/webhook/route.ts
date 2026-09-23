import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runAgentTurn } from "@/lib/llmTools";
import { sendLineMessages } from "@/lib/lineMessaging";
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

async function replyCheckinAsk(opts: {
  lineToken: string;
  replyToken: string;
  tag: string;
  liffId?: string;
}): Promise<boolean> {
  const flex = buildLocationAskFlex({
    liffId: resolveLiffId(opts.liffId) || getEnvLiffId(),
    tag: opts.tag || undefined,
  });
  const result = await sendLineMessages({
    channelAccessToken: opts.lineToken,
    sendMode: "reply",
    replyToken: opts.replyToken,
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
  liffId?: string;
  endpoints: Array<{ id: string; label?: string }>;
  templateFields?: Record<string, string> | null;
}): Promise<boolean> {
  const flex = resolveLocationTypeChooserFlex({
    liffId: resolveLiffId(opts.liffId) || getEnvLiffId(),
    endpoints: opts.endpoints,
    templateFields: opts.templateFields,
  });
  const result = await sendLineMessages({
    channelAccessToken: opts.lineToken,
    sendMode: "reply",
    replyToken: opts.replyToken,
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

    // Multi HTTP endpoints + no clear type → ask user to pick first
    if (locCfg.mode === "http" && endpoints.length >= 2 && !hasTypedEndpoint) {
      const chooserTpl = templates.find(
        (t) =>
          t.enabled &&
          (t.id === "location_type_chooser" ||
            t.conditionKey === "location_type_chooser")
      );
      await replyLocationTypeChooser({
        lineToken,
        replyToken,
        liffId: runtime.line.liffId,
        endpoints: endpoints.map((e) => ({
          id: e.id,
          label: e.label || e.id,
        })),
        templateFields: chooserTpl?.fields || null,
      });
      return;
    }

    await replyCheckinAsk({
      lineToken,
      replyToken,
      tag: nearby.tag,
      liffId: runtime.line.liffId,
    });
    return;
  }

  if (!openRouterKey) {
    console.warn(
      "[webhook] OPENROUTER_API_KEY / runtime agent.apiKey missing — skip LLM"
    );
    await sendLineMessages({
      channelAccessToken: lineToken,
      sendMode: "reply",
      replyToken,
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

    if (turn.flexMessage) {
      const result = await sendLineMessages({
        channelAccessToken: lineToken,
        sendMode: "reply",
        replyToken,
        messages: [turn.flexMessage],
      });
      if (!result.ok) {
        console.error("[webhook] flex reply failed", result);
      }
      return;
    }

    const result = await sendLineMessages({
      channelAccessToken: lineToken,
      sendMode: "reply",
      replyToken,
      messages: [
        {
          type: "text",
          text: stripMarkdownForLine(turn.assistantText || "รับข้อความแล้วครับ"),
        },
      ],
    });
    if (!result.ok) {
      console.error("[webhook] text reply failed", result);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[webhook] agent error", msg);
    try {
      await sendLineMessages({
        channelAccessToken: lineToken,
        sendMode: "reply",
        replyToken,
        messages: [
          {
            type: "text",
            text: `ขออภัย มีข้อผิดพลาด: ${msg.slice(0, 120)}`,
          },
        ],
      });
    } catch {
      /* ignore */
    }
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

  for (const event of events) {
    if (event.source?.userId) {
      await recordWebhookUser(
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
      // MVP: process sync so replyToken is still valid
      await handleTextMessage(event);
    }
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
