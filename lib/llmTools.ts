import {
  TEMPLATE_META,
  buildFlex,
  defaultFields,
} from "./flexTemplates";
import { buildLocationAskFlex } from "./nearbyFlex";
import { mapIntentToLongdoTag } from "./longdo";
import { getEnvLiffId } from "./liffConfig";
import type { ConsoleTemplate, FlexMessage, TemplateId } from "./types";
import {
  chatCompletion,
  getDefaultModel,
  type OpenRouterMessage,
  type OpenRouterTool,
  type OpenRouterToolCall,
} from "./openrouter";

export type ToolTraceEntry = {
  name: string;
  args: unknown;
  resultSummary: string;
};

export type AgentTurnResult = {
  assistantText: string;
  flexMessage?: FlexMessage;
  conditionKey?: string;
  toolTrace: ToolTraceEntry[];
  raw?: unknown;
};

const BUILTIN_IDS = new Set(TEMPLATE_META.map((t) => t.id));

const SYSTEM_PROMPT = `You are a LINE Flex Message assistant (ผู้ช่วย Flex Message สำหรับ LINE).
Prefer calling render_flex_template when the user wants a rich card / carousel / product / news message.
NEARBY / LOCATION (mandatory): When the user asks nearby places / ใกล้เคียง / ใกล้ฉัน / แถวนี้มี… / 7-11 / โรงพยาบาล / คอนโด / ห้าง or check-in / แชร์พิกัด — you MUST call render_flex_template with condition_key=checkin_ask and set fields.tag to a Longdo tag when known (e.g. 7-11, hospital, condominium, department_store). Never reply with plain text like «ไม่มีข้อมูล» / «ไม่พบ» / «ไม่มีในระบบ» without location first — always send the LIFF checkin_ask card so the user can share GPS. Do not use LINE location picker as primary.
Use condition_key from the enabled templates list when provided.
Use HTTPS image URLs only. Softnix accent (#2786C2) is informational only — templates already apply it.
If the request is unclear, ask briefly in Thai or pick bubble-simple / the closest condition.
You may call list_flex_templates first to see available templates.
Use send_text_reply only for plain text fallback (not flex) — never for nearby/POI questions.
ตอบสั้น ๆ เป็นภาษาไทยได้เมื่อคุยกับผู้ใช้.`;

export const LLM_TOOLS: OpenRouterTool[] = [
  {
    type: "function",
    function: {
      name: "list_flex_templates",
      description:
        "List available LINE Flex Message templates (condition_key + kind).",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "render_flex_template",
      description:
        "Build a LINE Flex Message from condition_key (preferred) or templateId/kind, with optional field overrides. For nearby/ใกล้เคียง/7-11/โรงพยาบาล/แชร์พิกัด use condition_key=checkin_ask and fields.tag when known.",
      parameters: {
        type: "object",
        properties: {
          condition_key: {
            type: "string",
            description:
              "Console condition key e.g. ask_product, confirm_appointment",
          },
          conditionKey: {
            type: "string",
            description: "Alias of condition_key",
          },
          templateId: {
            type: "string",
            description:
              "Builtin kind: bubble-simple, bubble-hero, carousel, product-card, news-list, raw-json",
          },
          fields: {
            type: "object",
            description:
              "String field overrides (title, body, buttonUrl, heroImage, etc.)",
            additionalProperties: { type: "string" },
          },
          altText: {
            type: "string",
            description: "Optional alt text override for the flex message",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_text_reply",
      description:
        "Prepare a plain text reply (not flex). Use when flex is not appropriate.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Plain text to send to the user",
          },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
];

function stringifyFields(
  fields: Record<string, unknown> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fields || typeof fields !== "object") return out;
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

type ToolCtx = {
  customTemplates: ConsoleTemplate[];
};

function executeTool(
  name: string,
  argsRaw: unknown,
  state: {
    flexMessage?: FlexMessage;
    textReply?: string;
    conditionKey?: string;
  },
  ctx: ToolCtx
): { content: string; summary: string } {
  let args: Record<string, unknown> = {};
  if (typeof argsRaw === "string") {
    try {
      args = JSON.parse(argsRaw) as Record<string, unknown>;
    } catch {
      return {
        content: JSON.stringify({ ok: false, error: "Invalid JSON arguments" }),
        summary: "invalid args JSON",
      };
    }
  } else if (argsRaw && typeof argsRaw === "object") {
    args = argsRaw as Record<string, unknown>;
  }

  if (name === "list_flex_templates") {
    const enabled = ctx.customTemplates.filter((t) => t.enabled);
    if (enabled.length > 0) {
      const templates = enabled.map((t) => ({
        condition_key: t.conditionKey,
        displayNameTh: t.displayNameTh,
        kind: t.kind,
        description: t.modelDescription,
        variables: t.variables,
      }));
      return {
        content: JSON.stringify({ ok: true, templates }),
        summary: `listed ${templates.length} console templates`,
      };
    }
    const templates = TEMPLATE_META.map((t) => ({
      id: t.id,
      label: t.label,
      labelTh: t.labelTh,
      description: t.description,
    }));
    return {
      content: JSON.stringify({ ok: true, templates }),
      summary: `listed ${templates.length} builtin templates`,
    };
  }

  if (name === "render_flex_template") {
    const conditionKey = String(
      args.condition_key || args.conditionKey || ""
    ).trim();
    const templateIdRaw = String(args.templateId || "").trim();

    let kind: TemplateId | null = null;
    let baseFields: Record<string, string> = {};
    let resolvedKey = conditionKey;

    if (conditionKey) {
      const found = ctx.customTemplates.find(
        (t) => t.enabled && t.conditionKey === conditionKey
      );
      if (found) {
        kind = found.kind;
        baseFields = { ...found.fields };
        resolvedKey = found.conditionKey;
      }
    }

    if (!kind && templateIdRaw) {
      // Allow using condition_key as templateId when custom list is present
      const byKey = ctx.customTemplates.find(
        (t) =>
          t.enabled &&
          (t.conditionKey === templateIdRaw || t.id === templateIdRaw)
      );
      if (byKey) {
        kind = byKey.kind;
        baseFields = { ...byKey.fields };
        resolvedKey = byKey.conditionKey;
      } else if (BUILTIN_IDS.has(templateIdRaw as TemplateId)) {
        kind = templateIdRaw as TemplateId;
        baseFields = defaultFields(kind);
      }
    }

    if (!kind) {
      return {
        content: JSON.stringify({
          ok: false,
          error: `Unknown condition_key/templateId: ${conditionKey || templateIdRaw}`,
          knownConditionKeys: ctx.customTemplates
            .filter((t) => t.enabled)
            .map((t) => t.conditionKey),
          knownKinds: [...BUILTIN_IDS],
        }),
        summary: `unknown template ${conditionKey || templateIdRaw}`,
      };
    }

    const overrides = stringifyFields(
      args.fields as Record<string, unknown> | undefined
    );
    const merged = { ...baseFields, ...overrides };
    if (typeof args.altText === "string" && args.altText.trim()) {
      merged.altText = args.altText.trim();
    }

    let flex: FlexMessage;
    if (
      resolvedKey === "checkin_ask" ||
      conditionKey === "checkin_ask" ||
      resolvedKey === "location_ask" ||
      conditionKey === "nearby_ask"
    ) {
      const tag =
        (merged.tag || "").trim() ||
        mapIntentToLongdoTag(
          String(args.intent || args.query || merged.body || "")
        );
      flex = buildLocationAskFlex({
        liffId: getEnvLiffId(),
        tag: tag || undefined,
        title: merged.title || undefined,
        body: merged.body || undefined,
        buttonLabel: merged.buttonLabel || undefined,
      });
      if (merged.altText) flex.altText = merged.altText;
    } else {
      flex = buildFlex(kind, merged);
    }
    state.flexMessage = flex;
    state.conditionKey = resolvedKey || undefined;
    return {
      content: JSON.stringify({
        ok: true,
        condition_key: resolvedKey || null,
        templateId: kind,
        altText: flex.altText,
        contentsType: (flex.contents as { type?: string })?.type,
        message: flex,
      }),
      summary: `rendered ${resolvedKey || kind}`,
    };
  }

  if (name === "send_text_reply") {
    const text = String(args.text ?? "").trim();
    if (!text) {
      return {
        content: JSON.stringify({ ok: false, error: "text is required" }),
        summary: "empty text",
      };
    }
    state.textReply = text;
    return {
      content: JSON.stringify({ ok: true, text }),
      summary: `text reply (${text.length} chars)`,
    };
  }

  return {
    content: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` }),
    summary: `unknown tool ${name}`,
  };
}

function parseToolArgs(call: OpenRouterToolCall): unknown {
  try {
    return JSON.parse(call.function.arguments || "{}");
  } catch {
    return call.function.arguments;
  }
}

export async function runAgentTurn(opts: {
  openRouterKey: string;
  model?: string;
  baseUrl?: string;
  userText: string;
  systemExtra?: string;
  templates?: ConsoleTemplate[];
}): Promise<AgentTurnResult> {
  const model = (opts.model || getDefaultModel()).trim() || getDefaultModel();
  const userText = (opts.userText || "").trim();
  if (!userText) {
    return {
      assistantText: "",
      toolTrace: [],
      raw: { error: "userText is empty" },
    };
  }

  const customTemplates = (opts.templates || []).filter((t) => t.enabled);
  let systemContent = opts.systemExtra
    ? `${SYSTEM_PROMPT}\n\n${opts.systemExtra}`
    : SYSTEM_PROMPT;

  if (customTemplates.length > 0) {
    const catalog = customTemplates
      .map(
        (t) =>
          `- condition_key=${t.conditionKey} · ${t.displayNameTh} · kind=${t.kind} · ${t.modelDescription}`
      )
      .join("\n");
    systemContent += `\n\nEnabled Flex templates (use condition_key with render_flex_template):\n${catalog}`;
  }

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: userText },
  ];

  const toolTrace: ToolTraceEntry[] = [];
  const state: {
    flexMessage?: FlexMessage;
    textReply?: string;
    conditionKey?: string;
  } = {};
  const ctx: ToolCtx = { customTemplates };
  const rawRounds: unknown[] = [];
  const maxRounds = 4;

  let assistantText = "";

  for (let round = 0; round < maxRounds; round++) {
    const completion = await chatCompletion(
      opts.openRouterKey,
      {
        model,
        messages,
        tools: LLM_TOOLS,
        tool_choice: "auto",
      },
      { baseUrl: opts.baseUrl }
    );
    rawRounds.push(completion);

    const choice = completion.choices?.[0];
    const msg = choice?.message;
    if (!msg) {
      break;
    }

    const toolCalls = msg.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const name = call.function?.name || "";
        const args = parseToolArgs(call);
        const { content, summary } = executeTool(name, args, state, ctx);
        toolTrace.push({
          name,
          args,
          resultSummary: summary,
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content,
        });
      }
      continue;
    }

    assistantText = (msg.content || "").trim();
    messages.push({ role: "assistant", content: msg.content ?? "" });
    break;
  }

  if (!assistantText && state.textReply) {
    assistantText = state.textReply;
  }
  if (!assistantText && state.flexMessage) {
    assistantText = `สร้าง Flex Message แล้ว (${state.flexMessage.altText})`;
  }

  return {
    assistantText,
    flexMessage: state.flexMessage,
    conditionKey: state.conditionKey,
    toolTrace,
    raw: { model, rounds: rawRounds },
  };
}
