import type { ConsoleState } from "@/lib/types";

export type Readiness = {
  agentConfigured: boolean;
  hasEnabledTemplate: boolean;
  hasToken: boolean;
  webhookConfirmed: boolean;
  /** 0–4 completed of the four gate steps */
  completedSteps: number;
  /** percent of the four gate steps (agent, flex, token, webhook) */
  percent: number;
  /** true when all four gates pass */
  ready: boolean;
  badgeLabel: string;
  badgeKind: "ok" | "warn";
};

/**
 * Single source of truth for Overview checklist, header badge,
 * and Sandbox status chips. Never show "connected" when !hasToken.
 */
export function computeReadiness(state: ConsoleState): Readiness {
  const a = state.agent;
  const agentConfigured = Boolean(
    a.name.trim() &&
      a.prompt.trim() &&
      a.baseUrl.trim() &&
      a.model.trim() &&
      a.apiKey.trim()
  );
  const hasEnabledTemplate = state.templates.some((t) => t.enabled);
  const hasToken = Boolean(state.line.channelAccessToken.trim());
  const webhookConfirmed = Boolean(state.line.webhookConfirmed);

  const flags = [
    agentConfigured,
    hasEnabledTemplate,
    hasToken,
    webhookConfirmed,
  ];
  const completedSteps = flags.filter(Boolean).length;
  const percent = Math.round((completedSteps / 4) * 100);
  const ready = completedSteps === 4;

  let badgeLabel = "พร้อมใช้งาน";
  let badgeKind: "ok" | "warn" = "ok";
  if (!ready) {
    badgeKind = "warn";
    if (!agentConfigured) badgeLabel = "เหลือตั้งค่า Agent";
    else if (!hasEnabledTemplate) badgeLabel = "เหลือเทมเพลต Flex";
    else if (!hasToken) badgeLabel = "เหลือ Token";
    else if (!webhookConfirmed) badgeLabel = "เหลือ Webhook";
    else badgeLabel = "ยังไม่ครบ";
  }

  return {
    agentConfigured,
    hasEnabledTemplate,
    hasToken,
    webhookConfirmed,
    completedSteps,
    percent,
    ready,
    badgeLabel,
    badgeKind,
  };
}

export function buildHintParagraph(
  conditionKey: string,
  displayNameTh?: string
): string {
  const name = displayNameTh ? ` (${displayNameTh})` : "";
  return `เมื่อลูกค้าพูดตรงเงื่อนไข «${conditionKey}»${name} ให้เรียกการ์ด Flex ด้วย condition_key=${conditionKey}`;
}
