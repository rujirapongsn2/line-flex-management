import type { ConsoleTemplate } from "./types";

export const FLEX_PROMPT_START = "<!-- FLEX_CONDITIONS_START -->";
export const FLEX_PROMPT_END = "<!-- FLEX_CONDITIONS_END -->";

/**
 * Build a Thai+structured Flex conditions block for the Install Prompt.
 * Only includes enabled templates.
 */
export function buildFlexConditionsBlock(
  templates: ConsoleTemplate[]
): string {
  const enabled = templates.filter((t) => t.enabled);

  const lines: string[] = [
    FLEX_PROMPT_START,
    "## เงื่อนไขการ์ด Flex ที่เปิดใช้งาน",
    "",
    "เมื่อเจตนา (intent) ของลูกค้าตรงกับรายการด้านล่าง ให้เรียกเครื่องมือ render_flex_template โดยใช้ condition_key ตามที่ระบุ — ห้ามคิดหรือประดิษฐ์ condition_key ที่ไม่มีในรายการนี้",
    "",
  ];

  if (enabled.length === 0) {
    lines.push("(ยังไม่มีเทมเพลตที่เปิดใช้งาน)");
  } else {
    enabled.forEach((t, i) => {
      lines.push(`${i + 1}. ชื่อการ์ด: ${t.displayNameTh}`);
      lines.push(`   รหัสการ์ด (condition_key): ${t.conditionKey}`);
      lines.push(
        `   คำอธิบายกรณีการใช้งาน: ${t.modelDescription.trim() || "(ไม่มี)"}`
      );
      const examples = (t.triggerExamples || [])
        .map((e) => e.trim())
        .filter(Boolean);
      if (examples.length > 0) {
        lines.push(
          `   ตัวอย่างข้อความกระตุ้น: ${examples.map((e) => `«${e}»`).join(" · ")}`
        );
      }
      lines.push(
        `   → เมื่อตรงเงื่อนไข ให้เรียก render_flex_template ด้วย condition_key=${t.conditionKey}`
      );
      lines.push("");
    });
  }

  lines.push(FLEX_PROMPT_END);
  return lines.join("\n").trimEnd() + "\n";
}

/**
 * Merge Flex conditions into an existing Install Prompt.
 * If markers exist, replace the block between them (inclusive).
 * Otherwise append the block after a blank line.
 * Persona / role text outside the markers is preserved.
 */
export function mergeFlexConditionsIntoPrompt(
  existingPrompt: string,
  templates: ConsoleTemplate[]
): string {
  const block = buildFlexConditionsBlock(templates).trimEnd();
  const startIdx = existingPrompt.indexOf(FLEX_PROMPT_START);
  const endIdx = existingPrompt.indexOf(FLEX_PROMPT_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingPrompt.slice(0, startIdx).replace(/\s+$/, "");
    const after = existingPrompt
      .slice(endIdx + FLEX_PROMPT_END.length)
      .replace(/^\s+/, "");
    const parts: string[] = [];
    if (before) parts.push(before);
    parts.push(block);
    if (after) parts.push(after);
    return parts.join("\n\n");
  }

  const trimmed = existingPrompt.trim();
  if (!trimmed) return block;
  return `${trimmed}\n\n${block}`;
}
