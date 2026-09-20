/**
 * Normalize JSON copied from LINE Flex Message Simulator
 * https://developers.line.biz/flex-simulator/
 */

export type FlexSimulatorParseOk = {
  ok: true;
  contents: object;
  altText?: string;
  source: "contents" | "flex-message" | "messages";
};

export type FlexSimulatorParseErr = {
  ok: false;
  error: string;
};

export type FlexSimulatorParseResult =
  | FlexSimulatorParseOk
  | FlexSimulatorParseErr;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractFlexMessage(
  obj: Record<string, unknown>,
  source: "flex-message" | "messages"
): FlexSimulatorParseResult {
  const contents = obj.contents;
  if (!isPlainObject(contents)) {
    return {
      ok: false,
      error: "flex message ต้องมี contents เป็น object (bubble หรือ carousel)",
    };
  }
  if (contents.type !== "bubble" && contents.type !== "carousel") {
    return {
      ok: false,
      error: "contents.type ต้องเป็น bubble หรือ carousel",
    };
  }
  const altText =
    typeof obj.altText === "string" && obj.altText.trim()
      ? obj.altText
      : undefined;
  return { ok: true, contents, altText, source };
}

/**
 * Accepts:
 * 1. Flex contents only: { type: "bubble"|"carousel", ... }
 * 2. Full flex message: { type: "flex", altText?, contents }
 * 3. Wrapper { messages: [ { type: "flex", ... } ] } — first flex message
 */
export function parseFlexSimulatorJson(raw: string): FlexSimulatorParseResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "ว่างเปล่า — กรุณาวาง JSON จาก Flex Simulator",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      error: "JSON ไม่ถูกต้อง — ตรวจสอบเครื่องหมายหรือโครงสร้าง",
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      error: "ต้องเป็น JSON object ไม่ใช่ array หรือค่าอื่น",
    };
  }

  // Optional { messages: [ flex, ... ] }
  if (Array.isArray(parsed.messages)) {
    const firstFlex = parsed.messages.find(
      (m): m is Record<string, unknown> =>
        isPlainObject(m) && m.type === "flex"
    );
    if (!firstFlex) {
      return {
        ok: false,
        error: "ไม่พบข้อความ type:flex ใน messages",
      };
    }
    return extractFlexMessage(firstFlex, "messages");
  }

  // Full flex message
  if (parsed.type === "flex") {
    return extractFlexMessage(parsed, "flex-message");
  }

  // Contents only
  if (parsed.type === "bubble" || parsed.type === "carousel") {
    return { ok: true, contents: parsed, source: "contents" };
  }

  return {
    ok: false,
    error:
      "ไม่รู้จักรูปแบบ — ต้องเป็น bubble/carousel, { type:flex, contents } หรือ { messages:[flex] }",
  };
}

/** Pretty-print contents for storage in fields.rawContents */
export function prettyContents(contents: object): string {
  return JSON.stringify(contents, null, 2);
}
