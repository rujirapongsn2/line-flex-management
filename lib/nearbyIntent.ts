import { mapIntentToLongdoTag } from "./longdo";

/**
 * Detect "nearby places" / share-location / LDD planting intents (Thai + EN).
 * Used for webhook hard-route (P0) before LLM.
 * Requires nearby/check-in context so casual mentions of "อาหาร" etc. do not steal the turn.
 * LDD soil/plant/pool only hard-route when the user clearly wants a location lookup —
 * not for knowledge Q&A like "ชุดดินชลบุรีคืออะไร".
 */
const NEARBY_CONTEXT_RE =
  /ใกล้(?:เคียง|ฉัน|นี้)?|แถวนี้|แถวๆ|ใกล้ๆ|ใกล้ ๆ|nearby|near\s+me|around\s+here|check[\s-]?in|เช็คอิน|เชคอิน|แชร์พิกัด|แชร์ตำแหน่ง|share\s+location|สถานที่ใกล้|หา(?:ร้าน|ที่|สถานที่).*ใกล้|ค้นหา.*ใกล้|longdo/i;

/** Words that mean "at my location / share pin" — required for soft LDD phrases. */
const LOC_CTX_RE =
  /พิกัด|ตำแหน่ง|ตรงนี้|แถว(?:นี้|ๆ)?|ใกล้(?:เคียง|ฉัน|นี้)?|check[\s-]?in|เช็ค.?อิน|แชร์|nearby|near\s+me|สถานที่|ที่นี่|บริเวณนี้/i;

/** Definition / encyclopedia questions → never steal to LIFF check-in. */
const KNOWLEDGE_QA_RE =
  /คืออะไร|คือไร|หมายถึง|หมายความว่า|อธิบาย(?:หน่อย|ให้)?|ต่างจาก|มีกี่|คือ\s*$|what\s+is|explain/i;

export type NearbyIntent = {
  matched: boolean;
  tag: string;
};

/** Map explicit LDD planting intents → endpoint ids used as LIFF ?tag= */
export function mapIntentToLddTag(raw: string): string {
  const q = (raw || "").trim();
  if (!q) return "";

  // Knowledge questions about named series / terms go to the agent, not LIFF.
  if (KNOWLEDGE_QA_RE.test(q)) return "";

  const hasLoc = LOC_CTX_RE.test(q);

  // Strong location-bound soil phrases (ok without extra loc words)
  if (
    /ดินตรงนี้|ดูดิน(?:แถว|ใกล้|ตรง|ที่นี่)?|วิเคราะห์ดิน|search\s*soil/i.test(q)
  ) {
    return "soil";
  }
  // Soft soil phrases need location context (avoids "ชุดดินชลบุรี" → check-in)
  if (
    hasLoc &&
    /(ข้อมูลดิน|ชุดดิน|สภาพดิน|ความเหมาะสม.*ดิน|ดิน.*ความเหมาะสม|\bsoil\b)/i.test(q)
  ) {
    return "soil";
  }
  if (/ดิน/.test(q) && hasLoc) return "soil";

  // Strong plant phrases tied to suitability / search
  if (/search\s*plant|planting\s*suit|พืชที่เหมาะสม(?:ตรงนี้|แถว|ใกล้)?/i.test(q)) {
    return "plant";
  }
  // "ปลูกอะไร" alone is too broad — require location context
  if (hasLoc && /(ปลูกอะไร|พืชแนะนำ|แนะนำพืช|\bplant\b)/i.test(q)) {
    return "plant";
  }
  if (/พืช/.test(q) && hasLoc) return "plant";

  // Pool / water
  if (/search\s*pool|ดูสระ|สระน้ำตรงนี้/i.test(q)) return "pool";
  if (
    hasLoc &&
    /(แหล่งน้ำ|สระน้ำ|น้ำเพื่อการเกษตร|ข้อมูลน้ำ|\bpool\b)/i.test(q)
  ) {
    return "pool";
  }

  return "";
}

export function detectNearbyIntent(raw: string): NearbyIntent {
  const text = (raw || "").trim();
  if (!text) return { matched: false, tag: "" };

  const ldd = mapIntentToLddTag(text);
  if (ldd) return { matched: true, tag: ldd };

  if (!NEARBY_CONTEXT_RE.test(text)) {
    return { matched: false, tag: "" };
  }

  return { matched: true, tag: mapIntentToLongdoTag(text) };
}
