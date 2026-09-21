/**
 * After Location Action: LLM reply → LINE push (text and/or flex).
 * Fallback Flex nearby_results if LLM fails.
 */

import type { LocationActionResult } from "./locationAction";
import { sendLineMessages, type LineMessage } from "./lineMessaging";
import { chatCompletion } from "./openrouter";
import type { AgentConfig, FlexMessage, LocationActionConfig } from "./types";

export type LocationReplyOutcome = {
  llmUsed: boolean;
  pushed: boolean;
  pushError: string | null;
  replyKind: "text" | "flex" | "both" | "none";
  assistantText?: string;
};

function buildUserPrompt(
  result: LocationActionResult,
  displayName?: string
): string {
  const who = displayName ? `ผู้ใช้: ${displayName}\n` : "";
  const tagLine = result.tag ? `แท็ก/หมวด: ${result.tag}\n` : "";
  const guidance =
    result.mode === "none"
      ? "ยังไม่มีรายการสถานที่ — ยืนยันพิกัดที่ได้รับ และถามว่าต้องการหาอะไรใกล้เคียง (เช่น 7-11, โรงพยาบาล) หรือให้ความช่วยเหลืออื่น"
      : "สรุปผลให้ลูกค้าสั้น กระชับ เป็นมิตรเป็นภาษาไทย หากมีรายการ แนะนำ 2–5 รายการเด่น พร้อมที่อยู่/ระยะถ้ามี — ห้ามแต่งข้อมูลที่ไม่มีในผลลัพธ์";
  return `${who}พิกัด: lat=${result.lat}, lon=${result.lon}
โหมด Location Action: ${result.mode}
${tagLine}
ผลลัพธ์จากระบบ:
${result.summaryText}

${guidance}`;
}

export async function replyAfterLocationAction(opts: {
  result: LocationActionResult;
  config: LocationActionConfig;
  agent: AgentConfig;
  channelAccessToken: string;
  userId: string;
  displayName?: string;
}): Promise<LocationReplyOutcome> {
  const useLlm = opts.config.reply?.useLlm !== false;
  const token = (opts.channelAccessToken || "").trim();
  const userId = (opts.userId || "").trim();
  if (!token || !userId) {
    return {
      llmUsed: false,
      pushed: false,
      pushError: !token ? "no LINE token" : "no userId",
      replyKind: "none",
    };
  }

  const messages: LineMessage[] = [];
  let llmUsed = false;
  let assistantText = "";

  if (
    useLlm &&
    opts.agent?.enabled !== false &&
    (opts.agent.apiKey || "").trim()
  ) {
    try {
      const system = [
        opts.agent.prompt ||
          "คุณเป็นผู้ช่วย Softnix บน LINE ตอบสั้น ชัด เป็นภาษาไทย",
        "",
        "บริบท: ลูกค้าเพิ่งแชร์พิกัดผ่าน LIFF แล้วระบบรัน Location Action แล้ว",
        "ตอบด้วยข้อความธรรมดาเท่านั้น (ไม่มี tool) — สรุปผลให้ลูกค้า",
      ].join("\n");

      const completion = await chatCompletion(
        opts.agent.apiKey,
        {
          model: opts.agent.model || "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: buildUserPrompt(opts.result, opts.displayName),
            },
          ],
          temperature: 0.4,
        },
        { baseUrl: opts.agent.baseUrl }
      );
      assistantText = (
        completion.choices?.[0]?.message?.content || ""
      ).trim();
      if (assistantText) {
        llmUsed = true;
        messages.push({ type: "text", text: assistantText.slice(0, 4500) });
      }
    } catch (err) {
      console.warn(
        "[locationReply] LLM failed",
        err instanceof Error ? err.message : err
      );
    }
  }

  // Fallback flex when LLM failed
  if (!llmUsed && opts.result.flex) {
    messages.push(opts.result.flex as FlexMessage);
  }

  // longdo: attach flex carousel after LLM text for richer UX
  if (
    llmUsed &&
    opts.result.mode === "longdo_poi" &&
    opts.result.flex &&
    opts.result.count > 0
  ) {
    messages.push(opts.result.flex as FlexMessage);
  }

  // mode=none without LLM: confirm coords
  if (!messages.length && opts.result.mode === "none") {
    messages.push({
      type: "text",
      text: `รับพิกัดแล้วครับ: ${opts.result.lat.toFixed(6)}, ${opts.result.lon.toFixed(6)}\nบอกได้เลยว่าต้องการหาอะไรใกล้เคียง`,
    });
  }

  // last resort: summary text
  if (!messages.length && opts.result.ok && opts.result.summaryText) {
    messages.push({
      type: "text",
      text: opts.result.summaryText.slice(0, 4500),
    });
  }

  if (!messages.length) {
    return {
      llmUsed,
      pushed: false,
      pushError: "no reply content",
      replyKind: "none",
      assistantText: assistantText || undefined,
    };
  }

  const toSend = messages.slice(0, 5);
  const result = await sendLineMessages({
    channelAccessToken: token,
    sendMode: "push",
    userId,
    messages: toSend,
  });

  const hasText = toSend.some((m) => m.type === "text");
  const hasFlex = toSend.some((m) => m.type === "flex");
  const replyKind =
    hasText && hasFlex ? "both" : hasFlex ? "flex" : hasText ? "text" : "none";

  return {
    llmUsed,
    pushed: result.ok,
    pushError: result.ok ? null : result.error || "push failed",
    replyKind,
    assistantText: assistantText || undefined,
  };
}
