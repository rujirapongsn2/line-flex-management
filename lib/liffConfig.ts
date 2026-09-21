/** Public site + LIFF helpers (env + runtime LineConfig). */

export const DEFAULT_PUBLIC_BASE_URL = "https://line.rujirapong.us";

export function getPublicBaseUrl(): string {
  const fromEnv = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return DEFAULT_PUBLIC_BASE_URL;
}

export function getEnvLiffId(): string {
  return (process.env.LIFF_ID || "").trim();
}

/** Prefer env LIFF_ID; fall back to runtime DB value. */
export function resolveLiffId(runtimeLiffId?: string | null): string {
  const envId = getEnvLiffId();
  if (envId) return envId;
  return (runtimeLiffId || "").trim();
}

export function getCheckinPageUrl(tag?: string | null): string {
  const base = `${getPublicBaseUrl()}/liff/checkin`;
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
