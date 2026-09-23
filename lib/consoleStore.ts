import { defaultFields } from "./flexTemplates";
import { checkinAskTemplateFields, checkinResultTemplateFields } from "./checkinFlex";
import { locationTypeChooserTemplateFields } from "./nearbyFlex";
import { getLiffOpenUrl } from "./liffConfig";
import type {
  AgentConfig,
  ConsoleState,
  ConsoleTemplate,
  LineConfig,
} from "./types";
import { CONSOLE_STORAGE_KEY, LLM_STORAGE_KEY, STORAGE_KEY, defaultLocationAction } from "./types";

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function seedTemplates(): ConsoleTemplate[] {
  const product = defaultFields("product-card");
  product.name = "Softnix Notebook Pro 14";
  product.price = "฿32,900";
  product.altText = "สอบถามสินค้า";

  const appointment = defaultFields("bubble-simple");
  appointment.title = "ยืนยันนัดหมาย";
  appointment.body =
    "วันพุธที่ 24 ก.ย. 2568 · 10:00 น.\nสถานที่: Softnix Office · กรุณากดยืนยัน";
  appointment.buttonLabel = "ยืนยันนัด";
  appointment.buttonUrl = "https://softnix.ai";
  appointment.altText = "ยืนยันนัดหมาย";

  const status = defaultFields("bubble-hero");
  status.title = "สรุปสถานะคำขอ";
  status.body = "สถานะ: กำลังดำเนินการ · อัปเดตล่าสุดวันนี้";
  status.button1Label = "ดูรายละเอียด";
  status.button1Url = "https://softnix.ai";
  status.button2Label = "";
  status.altText = "สรุปสถานะ";

  const news = defaultFields("news-list");
  news.altText = "รายการข่าว";

  return [
    {
      id: uid("tpl"),
      displayNameTh: "สอบถามสินค้า",
      conditionKey: "ask_product",
      modelDescription:
        "ใช้เมื่อลูกค้าถามรายละเอียดสินค้า ราคา สเปก หรือสต็อก — แสดงชื่อสินค้า ราคา และปุ่มดูรายละเอียด",
      triggerExamples: [
        "มีโน้ตบุ๊กตัวไหนแนะนำบ้าง ราคาประมาณเท่าไหร่",
        "ขอราคา Softnix Notebook",
      ],
      variables: [
        { name: "product_name", example: "Softnix Notebook Pro 14", required: true },
        { name: "price", example: "฿32,900", required: true },
        { name: "detail_url", example: "https://softnix.ai", required: false },
      ],
      kind: "product-card",
      fields: product,
      enabled: true,
    },
    {
      id: uid("tpl"),
      displayNameTh: "ยืนยันนัดหมาย",
      conditionKey: "confirm_appointment",
      modelDescription: "สรุปวันเวลาและสถานที่นัดให้ลูกค้ายืนยัน",
      triggerExamples: ["ขอยืนยันนัดวันพุธ", "จองคิวปรึกษา AI"],
      variables: [
        { name: "date", example: "24 ก.ย. 2568", required: true },
        { name: "time", example: "10:00", required: true },
        { name: "place", example: "Softnix Office", required: true },
        { name: "confirm_url", example: "https://softnix.ai", required: false },
      ],
      kind: "bubble-simple",
      fields: appointment,
      enabled: true,
    },
    {
      id: uid("tpl"),
      displayNameTh: "สรุปสถานะ",
      conditionKey: "status_summary",
      modelDescription: "รายงานสถานะคำขอ / เคส / ออเดอร์แบบย่อ",
      triggerExamples: ["สถานะคำขอของฉันเป็นอย่างไร", "ออเดอร์ถึงไหนแล้ว"],
      variables: [
        { name: "case_id", example: "SN-20481", required: true },
        { name: "status", example: "กำลังดำเนินการ", required: true },
        { name: "detail_url", example: "https://softnix.ai", required: false },
      ],
      kind: "bubble-hero",
      fields: status,
      enabled: true,
    },
    {
      id: "checkin_ask",
      displayNameTh: "แชร์พิกัดค้นหาใกล้เคียง",
      conditionKey: "checkin_ask",
      modelDescription:
        "เมื่อลูกค้าถามสถานที่ใกล้เคียง / ใกล้ฉัน / แถวนี้มี… / 7-11 / โรงพยาบาล / คอนโด / ห้าง หรือขอแชร์พิกัด — ส่งการ์ด CTA เปิด LIFF ให้แชร์ GPS (ใส่ fields.tag เป็น Longdo tag เช่น 7-11,hospital ถ้าทราบจากคำถาม; ไม่ใช้ LINE location picker เป็นหลัก)",
      triggerExamples: [
        "แถวนี้มีร้าน 7-11 ที่ไหนบ้าง",
        "มีโรงพยาบาลใกล้ฉันไหม",
        "ค้นหาคอนโดใกล้เคียง",
        "เช็คอิน",
        "แชร์พิกัด",
      ],
      variables: [],
      kind: "bubble-simple",
      fields: checkinAskTemplateFields(),
      enabled: true,
    },
    {
      id: "nearby_results",
      displayNameTh: "ผลค้นหาใกล้เคียง",
      conditionKey: "nearby_results",
      modelDescription:
        "การ์ดรายการ POI จาก Longdo หลังได้พิกัด (สร้างจาก /api/poi/search — ปกติไม่เรียกจากโมเดลโดยตรง)",
      triggerExamples: [],
      variables: [
        { name: "lat", example: "13.7563", required: true },
        { name: "lng", example: "100.5018", required: true },
        { name: "time", example: "21 ก.ย. 2569 11:00", required: false },
      ],
      kind: "bubble-simple",
      fields: checkinResultTemplateFields(),
      enabled: true,
    },
    {
      id: "location_type_chooser",
      displayNameTh: "เลือกประเภท Location Action",
      conditionKey: "location_type_chooser",
      modelDescription:
        "เมื่อลูกค้าขอเช็คอิน/ใกล้เคียงโดยไม่ระบุประเภท และ Location Action มีหลาย HTTP endpoint — ส่งการ์ดนี้ให้เลือกประเภท (ปุ่มเปิด LIFF ด้วย tag=endpoint id)",
      triggerExamples: [
        "เช็คอิน",
        "checkin",
        "หาข้อมูลจากพิกัด",
        "ข้อมูลดิน",
        "แหล่งน้ำใกล้ฉัน",
      ],
      variables: [],
      kind: "raw-json",
      fields: locationTypeChooserTemplateFields(),
      enabled: true,
    },
    {
      id: uid("tpl"),
      displayNameTh: "รายการข่าว",
      conditionKey: "news_list",
      modelDescription: "ส่งประกาศหรือข่าวหลายรายการในรูปแบบลิสต์",
      triggerExamples: ["มีข่าวอะไรใหม่บ้าง", "ส่งประกาศล่าสุดให้หน่อย"],
      variables: [
        { name: "header", example: "ข่าวล่าสุดจาก Softnix", required: true },
        { name: "item_count", example: "3", required: false },
      ],
      kind: "news-list",
      fields: news,
      enabled: true,
    },
  ];
}

export function defaultAgentPrompt(): string {
  return `คุณคือ Softnix Care ผู้ช่วยลูกค้าบน LINE
ตอบเป็นภาษาไทย สุภาพ กระชับ

เมื่อลูกค้าถามสินค้า → เรียกเงื่อนไข ask_product
เมื่อยืนยันนัดหมาย → เรียกเงื่อนไข confirm_appointment
เมื่อสรุปสถานะงาน → เรียกเงื่อนไข status_summary
เมื่อส่งข่าว/ประกาศ → เรียกเงื่อนไข news_list
เมื่อลูกค้าถามสถานที่ใกล้เคียง / ใกล้ฉัน / แถวนี้มี… / 7-11 / โรงพยาบาล / คอนโด / ห้าง หรือขอแชร์พิกัด/เช็คอิน → ต้องเรียกเงื่อนไข checkin_ask ทันที (ส่ง Flex การ์ดเปิด LIFF ให้แชร์ GPS พร้อม fields.tag ถ้าทราบ เช่น 7-11 — ห้ามใช้ location picker ของ LINE เป็นหลัก; ผลค้นหา Longdo จะส่งหลังได้พิกัดจาก LIFF)

สำคัญมาก: ห้ามตอบข้อความธรรมดาว่า «ไม่มีข้อมูล» / «ไม่พบ» / «ไม่มีในระบบ» เมื่อยังไม่ได้พิกัด — ต้องส่ง checkin_ask ก่อนเสมอ

ห้ามส่ง Flex ที่ไม่มีในรายการเทมเพลตที่เปิดใช้งาน
ถ้าไม่แน่ใจ ให้ถามกลับด้วยข้อความธรรมดาก่อน`;
}

export function defaultAgent(): AgentConfig {
  return {
    name: "Softnix Care",
    prompt: defaultAgentPrompt(),
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    apiKey: "",
    enabled: true,
  };
}

export function defaultLine(): LineConfig {
  return {
    channelAccessToken: "",
    channelSecret: "",
    webhookConfirmed: false,
    lastUserId: "",
    liffId: "",
    longdoApiKey: "",
    locationAction: defaultLocationAction(),
  };
}

export function createDefaultState(): ConsoleState {
  return {
    agent: defaultAgent(),
    line: defaultLine(),
    templates: seedTemplates(),
  };
}

export function createEmptyTemplate(): ConsoleTemplate {
  const kind = "raw-json" as const;
  return {
    id: uid("tpl"),
    displayNameTh: "เทมเพลตใหม่",
    conditionKey: "new_condition",
    modelDescription: "",
    triggerExamples: [],
    variables: [],
    kind,
    fields: defaultFields(kind),
    enabled: true,
  };
}

function migrateLegacy(): Partial<ConsoleState> | null {
  if (typeof window === "undefined") return null;
  try {
    const connRaw = localStorage.getItem(STORAGE_KEY);
    const llmRaw = localStorage.getItem(LLM_STORAGE_KEY);
    if (!connRaw && !llmRaw) return null;
    const agent = defaultAgent();
    const line = defaultLine();
    if (llmRaw) {
      const parsed = JSON.parse(llmRaw) as {
        openRouterApiKey?: string;
        model?: string;
      };
      if (parsed.openRouterApiKey) agent.apiKey = parsed.openRouterApiKey;
      if (parsed.model) agent.model = parsed.model;
    }
    if (connRaw) {
      const parsed = JSON.parse(connRaw) as {
        channelAccessToken?: string;
        userId?: string;
      };
      if (parsed.channelAccessToken)
        line.channelAccessToken = parsed.channelAccessToken;
      if (parsed.userId) line.lastUserId = parsed.userId;
    }
    return { agent, line };
  } catch {
    return null;
  }
}

export function loadConsoleState(): ConsoleState {
  const base = createDefaultState();
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(CONSOLE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ConsoleState>;
      return {
        agent: { ...base.agent, ...(parsed.agent || {}) },
        line: { ...base.line, ...(parsed.line || {}) },
        templates:
          Array.isArray(parsed.templates) && parsed.templates.length > 0
            ? parsed.templates
            : base.templates,
      };
    }
  } catch {
    /* ignore */
  }
  const migrated = migrateLegacy();
  if (migrated) {
    return {
      agent: { ...base.agent, ...(migrated.agent || {}) },
      line: { ...base.line, ...(migrated.line || {}) },
      templates: base.templates,
    };
  }
  return base;
}

export function saveConsoleState(state: ConsoleState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONSOLE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Local matcher: pick enabled template by trigger examples / keywords / condition key in text */
export function matchConditionKey(
  userText: string,
  templates: ConsoleTemplate[],
  prompt?: string
): ConsoleTemplate | null {
  const text = (userText || "").trim().toLowerCase();
  if (!text) return null;
  const enabled = templates.filter((t) => t.enabled);
  if (enabled.length === 0) return null;

  for (const t of enabled) {
    for (const ex of t.triggerExamples) {
      const e = ex.trim().toLowerCase();
      if (!e) continue;
      if (text.includes(e) || e.includes(text) || overlapScore(text, e) >= 0.45) {
        return t;
      }
    }
  }

  // Keyword heuristics from condition keys / Thai hints in prompt
  const heuristics: { key: string; words: string[] }[] = [
    { key: "ask_product", words: ["สินค้า", "ราคา", "โน้ตบุ๊ก", "notebook", "product", "สเปก", "สต็อก"] },
    { key: "confirm_appointment", words: ["นัด", "นัดหมาย", "จอง", "appointment", "ยืนยันนัด"] },
    { key: "status_summary", words: ["สถานะ", "ออเดอร์", "คำขอ", "เคส", "status"] },
    { key: "news_list", words: ["ข่าว", "ประกาศ", "news", "อัปเดต"] },
  ];
  for (const h of heuristics) {
    if (h.words.some((w) => text.includes(w.toLowerCase()))) {
      const found = enabled.find((t) => t.conditionKey === h.key);
      if (found) return found;
    }
  }

  // If prompt mentions a single matching condition near user words, prefer that
  if (prompt) {
    for (const t of enabled) {
      if (prompt.includes(t.conditionKey) && text.includes(t.conditionKey.toLowerCase())) {
        return t;
      }
    }
  }

  return null;
}

function overlapScore(a: string, b: string): number {
  const wa = new Set(a.split(/\s+/).filter((w) => w.length > 1));
  const wb = b.split(/\s+/).filter((w) => w.length > 1);
  if (wb.length === 0) return 0;
  let hit = 0;
  for (const w of wb) if (wa.has(w) || a.includes(w)) hit++;
  return hit / wb.length;
}
