import { mapIntentToLongdoTag } from "./longdo";

/**
 * Detect "nearby places" / share-location intents (Thai + EN).
 * Used for webhook hard-route (P0) before LLM.
 * Requires nearby/check-in context so casual mentions of "อาหาร" etc. do not steal the turn.
 */
const NEARBY_CONTEXT_RE =
  /ใกล้(?:เคียง|ฉัน|นี้)?|แถวนี้|แถวๆ|ใกล้ๆ|ใกล้ ๆ|nearby|near\s+me|around\s+here|check[\s-]?in|เช็คอิน|เชคอิน|แชร์พิกัด|แชร์ตำแหน่ง|share\s+location|สถานที่ใกล้|หา(?:ร้าน|ที่|สถานที่).*ใกล้|ค้นหา.*ใกล้|longdo/i;

export type NearbyIntent = {
  matched: boolean;
  tag: string;
};

export function detectNearbyIntent(raw: string): NearbyIntent {
  const text = (raw || "").trim();
  if (!text) return { matched: false, tag: "" };

  if (!NEARBY_CONTEXT_RE.test(text)) {
    return { matched: false, tag: "" };
  }

  return { matched: true, tag: mapIntentToLongdoTag(text) };
}
