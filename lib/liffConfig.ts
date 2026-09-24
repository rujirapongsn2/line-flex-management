/** Public site + LIFF helpers (env + runtime LineConfig). */

/**
 * Legacy personal / prior-install hosts rewritten at Flex render time when
 * PUBLIC_BASE_URL is set to the current install. Does not mutate DB rows.
 */
export const LEGACY_PUBLIC_HOSTS = [
  "https://line.rujirapong.us",
  "https://line-dev.rujirapong.us",
] as const;

/**
 * Prefer PUBLIC_BASE_URL. Empty when unset — callers that need an absolute
 * HTTPS URL for Flex/LINE must set PUBLIC_BASE_URL (no hardcoded personal domain).
 */
export function getPublicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
}

export function getEnvLiffId(): string {
  return (process.env.LIFF_ID || "").trim();
}

/** Prefer runtime/DB LineConfig.liffId; fall back to env LIFF_ID. */
export function resolveLiffId(runtimeLiffId?: string | null): string {
  const fromDb = (runtimeLiffId || "").trim();
  if (fromDb) return fromDb;
  return getEnvLiffId();
}

export function getCheckinPageUrl(tag?: string | null): string {
  const baseUrl = getPublicBaseUrl();
  const base = baseUrl ? `${baseUrl}/liff/checkin` : "/liff/checkin";
  const t = (tag || "").trim();
  if (!t) return base;
  return `${base}?tag=${encodeURIComponent(t)}`;
}

/**
 * URL for Flex URI button.
 * Prefer https://liff.line.me/{LIFF_ID} when configured so LINE opens LIFF context;
 * otherwise the HTTPS endpoint page. Optional tag query is appended.
 */
export function getLiffOpenUrl(
  liffId?: string | null,
  tag?: string | null
): string {
  const id = resolveLiffId(liffId);
  const t = (tag || "").trim();
  if (id) {
    const base = `https://liff.line.me/${id}`;
    return t ? `${base}?tag=${encodeURIComponent(t)}` : base;
  }
  return getCheckinPageUrl(t);
}

export function getCheckinSharedSecret(): string {
  return (
    process.env.CHECKIN_SHARED_SECRET ||
    process.env.POI_SHARED_SECRET ||
    ""
  ).trim();
}

/**
 * Rewrite absolute URLs that still point at a prior install host (or the
 * {{PUBLIC_BASE_URL}} placeholder) to the current PUBLIC_BASE_URL.
 * Backward compatible: leaves unrelated absolute URLs untouched; no DB write.
 */
export function rewritePublicUrl(url: string | null | undefined): string {
  const raw = (url || "").trim();
  if (!raw) return raw;
  const base = getPublicBaseUrl();
  if (!base) {
    // Still expand placeholder to empty-host relative when base missing
    if (raw.includes("{{PUBLIC_BASE_URL}}")) {
      return raw.split("{{PUBLIC_BASE_URL}}").join("");
    }
    return raw;
  }
  let out = raw.split("{{PUBLIC_BASE_URL}}").join(base);
  for (const legacy of LEGACY_PUBLIC_HOSTS) {
    if (out.startsWith(legacy)) {
      out = base + out.slice(legacy.length);
    } else if (out.includes(legacy)) {
      out = out.split(legacy).join(base);
    }
  }
  return out;
}

/** Apply rewritePublicUrl to common Flex field URL keys. */
export function rewritePublicFields(
  fields: Record<string, string>
): Record<string, string> {
  const urlKeys = new Set([
    "buttonUrl",
    "button1Url",
    "button2Url",
    "detailUrl",
    "shareUrl",
    "heroImage",
    "imageUrl",
    "c1ButtonUrl",
    "c2ButtonUrl",
    "c3ButtonUrl",
    "c1Image",
    "c2Image",
    "c3Image",
    "i1Url",
    "i2Url",
    "i3Url",
    "i1Image",
    "i2Image",
    "i3Image",
  ]);
  const out: Record<string, string> = { ...fields };
  for (const [k, v] of Object.entries(fields)) {
    if (
      urlKeys.has(k) ||
      /Url$/i.test(k) ||
      /Image$/i.test(k) ||
      /uri$/i.test(k)
    ) {
      out[k] = rewritePublicUrl(v);
    }
  }
  return out;
}
