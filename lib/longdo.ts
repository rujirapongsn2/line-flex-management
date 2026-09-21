/**
 * Longdo Map POI nearby search (server-side only — never expose API key to browser).
 * Docs: https://api.longdo.com/POIService/json/search
 */

export type LongdoPoi = {
  id?: string;
  name: string;
  lat: number;
  lon: number;
  address?: string;
  tel?: string;
  distance?: string | number;
  tags?: string[];
  url?: string;
};

export type LongdoSearchParams = {
  lat: number;
  lon: number;
  tag?: string;
  limit?: number;
  span?: string;
  keyword?: string;
};

export type LongdoSearchResult =
  | { ok: true; pois: LongdoPoi[]; rawMeta?: unknown }
  | { ok: false; error: string; status?: number };

const DEFAULT_TAGS = "hospital,7-11,condominium,department_store";

/** Thai / casual intent → Longdo tag(s). Returns CSV or empty. */
export function mapIntentToLongdoTag(raw: string): string {
  const q = (raw || "").trim().toLowerCase();
  if (!q) return "";

  const rules: Array<{ re: RegExp; tag: string }> = [
    { re: /7[\s\-]?11|เซเว่น|เซ븐|seven/, tag: "7-11" },
    { re: /โรงพยาบาล|รพ\.?|hospital/, tag: "hospital" },
    { re: /คลินิก|clinic/, tag: "clinic" },
    { re: /คอนโด|condominium|condo/, tag: "condominium" },
    { re: /ห้าง|department\s*store|เดอะมอลล์|central|เซ็นทรัล/, tag: "department_store" },
    { re: /โรงเรียน|school/, tag: "school" },
    { re: /มหาวิทยาลัย|university/, tag: "university" },
    { re: /ธนาคาร|bank/, tag: "bank" },
    { re: /ปั๊ม|gas\s*station|petrol/, tag: "gas_station" },
    { re: /ร้านอาหาร|restaurant|อาหาร/, tag: "restaurant" },
    { re: /คาเฟ่|cafe|coffee|กาแฟ/, tag: "cafe" },
    { re: /ร้านสะดวกซื้อ|convenience/, tag: "convenience_store" },
    { re: /โรงแรม|hotel/, tag: "hotel" },
    { re: /วัด|temple/, tag: "temple" },
    { re: /ตำรวจ|police/, tag: "police_station" },
    { re: /ไปรษณีย์|post\s*office/, tag: "post_office" },
  ];

  const found: string[] = [];
  for (const r of rules) {
    if (r.re.test(q) && !found.includes(r.tag)) found.push(r.tag);
  }
  return found.join(",");
}

export function getLongdoApiKey(runtimeKey?: string | null): string {
  const env = (process.env.LONGDO_API_KEY || "").trim();
  if (env) return env;
  return (runtimeKey || "").trim();
}

export function defaultNearbyTags(): string {
  return (process.env.LONGDO_DEFAULT_TAGS || "").trim() || DEFAULT_TAGS;
}

function normalizePois(payload: unknown): LongdoPoi[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const list = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.results)
      ? root.results
      : Array.isArray(payload)
        ? (payload as unknown[])
        : [];

  const out: LongdoPoi[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const coords =
      o.coordinates && typeof o.coordinates === "object"
        ? (o.coordinates as Record<string, unknown>)
        : null;
    const lat = Number(o.lat ?? coords?.lat);
    const lon = Number(o.lon ?? o.lng ?? coords?.lon ?? coords?.lng);
    const name = String(o.name || o.title || "").trim();
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const tagsRaw = o.tag ?? o.tags;
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.map(String)
      : typeof tagsRaw === "string"
        ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
    out.push({
      id: o.id != null ? String(o.id) : undefined,
      name,
      lat,
      lon,
      address: o.address != null ? String(o.address) : undefined,
      tel: o.tel != null ? String(o.tel) : undefined,
      distance: (o.distance as string | number | undefined) ?? undefined,
      tags,
      url: o.url != null ? String(o.url) : undefined,
    });
  }
  return out;
}

export async function searchLongdoNearby(
  params: LongdoSearchParams,
  apiKey: string
): Promise<LongdoSearchResult> {
  const key = (apiKey || "").trim();
  if (!key) {
    return {
      ok: false,
      error:
        "ยังไม่ได้ตั้ง LONGDO_API_KEY — ให้แอดมินใส่ใน .env ของ softnix-linedev แล้ว rebuild/restart",
    };
  }

  const limit = Math.min(20, Math.max(1, params.limit ?? 10));
  const span = (params.span || "300m").trim() || "300m";
  const tag = (params.tag || "").trim();

  const qs = new URLSearchParams();
  qs.set("key", key);
  qs.set("lat", String(params.lat));
  qs.set("lon", String(params.lon));
  qs.set("span", span);
  qs.set("limit", String(limit));
  qs.set("info", "true");
  qs.set("locale", "th");
  if (tag) qs.set("tag", tag);
  if (params.keyword?.trim()) qs.set("keyword", params.keyword.trim());

  const url = `https://api.longdo.com/POIService/json/search?${qs.toString()}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `Longdo API error (${res.status})`,
        status: res.status,
      };
    }
    const pois = normalizePois(json);
    return {
      ok: true,
      pois,
      rawMeta:
        json && typeof json === "object"
          ? (json as Record<string, unknown>).meta ??
            (json as Record<string, unknown>).metadata
          : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `เรียก Longdo ไม่สำเร็จ: ${msg}` };
  }
}

/** Resolve tag from explicit value or free-text intent; fall back to defaults. */
export function resolveSearchTag(opts: {
  tag?: string | null;
  intent?: string | null;
  useDefaultIfEmpty?: boolean;
}): string {
  const explicit = (opts.tag || "").trim();
  if (explicit) return explicit;
  const mapped = mapIntentToLongdoTag(opts.intent || "");
  if (mapped) return mapped;
  if (opts.useDefaultIfEmpty !== false) return defaultNearbyTags();
  return "";
}
