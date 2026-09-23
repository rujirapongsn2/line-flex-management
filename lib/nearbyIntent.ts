import { mapIntentToLongdoTag } from "./longdo";

/**
 * Detect "nearby places" / share-location / LDD planting intents (Thai + EN).
 * Used for webhook hard-route (P0) before LLM.
 * Requires nearby/check-in context so casual mentions of "อาหาร" etc. do not steal the turn,
 * except explicit soil/plant/pool LDD intents which open LIFF with the matching tag.
 */
const NEARBY_CONTEXT_RE =
  /ใกล้(?:เคียง|ฉัน|นี้)?|แถวนี้|แถวๆ|ใกล้ๆ|ใกล้ ๆ|nearby|near\s+me|around\s+here|check[\s-]?in|เช็คอิน|เชคอิน|แชร์พิกัด|แชร์ตำแหน่ง|share\s+location|สถานที่ใกล้|หา(?:ร้าน|ที่|สถานที่).*ใกล้|ค้นหา.*ใกล้|longdo/i;

const LDD_SOIL_RE =
  /ข้อมูลดิน|ชุดดิน|สภาพดิน|search\s*soil|ความเหมาะสม.*ดิน|ดินตรงนี้|ดูดิน|วิเคราะห์ดิน/i;
const LDD_PLANT_RE =
  /พืชที่เหมาะสม|ปลูกอะไร|search\s*plant|ความเหมาะสม.*พืช|พืชแนะนำ|แนะนำพืช|planting\s*suit/i;
const LDD_POOL_RE =
  /แหล่งน้ำ|สระน้ำ|search\s*pool|น้ำเพื่อการเกษตร|ข้อมูลน้ำ|ดูสระ/i;

export type NearbyIntent = {
  matched: boolean;
  tag: string;
};

/** Map explicit LDD planting intents → endpoint ids used as LIFF ?tag= */
export function mapIntentToLddTag(raw: string): string {
  const q = (raw || "").trim();
  if (!q) return "";
  if (LDD_SOIL_RE.test(q) || /\bsoil\b/i.test(q)) return "soil";
  if (LDD_PLANT_RE.test(q) || /\bplant\b/i.test(q)) return "plant";
  if (LDD_POOL_RE.test(q) || /\bpool\b/i.test(q)) return "pool";
  // bare "ดิน" / "พืช" only when paired with location-ish words
  if (/ดิน/.test(q) && /(พิกัด|ตำแหน่ง|ตรงนี้|แถว|ใกล้|check)/i.test(q)) return "soil";
  if (/พืช/.test(q) && /(พิกัด|ตำแหน่ง|ตรงนี้|แถว|ใกล้|check|ปลูก)/i.test(q)) return "plant";
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
