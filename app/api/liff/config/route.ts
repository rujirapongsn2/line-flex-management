import { NextResponse } from "next/server";
import {
  getCheckinPageUrl,
  getLiffOpenUrl,
  getPublicBaseUrl,
  resolveLiffId,
} from "@/lib/liffConfig";
import { getLongdoApiKey } from "@/lib/longdo";
import { parseLocationActionJson } from "@/lib/locationAction";
import { readRuntimeConfig } from "@/lib/serverRuntimeConfig";
import { defaultLocationAction } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Public: LIFF page needs liffId without admin cookie. Never returns API keys or http secrets. */
export async function GET() {
  let runtimeLiff = "";
  let runtimeLongdo = "";
  let locMode = "longdo_poi";
  try {
    const cfg = await readRuntimeConfig();
    runtimeLiff = (cfg.line as { liffId?: string }).liffId || "";
    runtimeLongdo = (cfg.line as { longdoApiKey?: string }).longdoApiKey || "";
    const loc =
      cfg.line.locationAction ||
      parseLocationActionJson("") ||
      defaultLocationAction();
    locMode = loc.mode || "longdo_poi";
  } catch {
    /* ignore */
  }
  const liffId = resolveLiffId(runtimeLiff);
  const configured = Boolean(liffId);
  const hasLongdoKey = Boolean(getLongdoApiKey(runtimeLongdo));
  // Action is ready unless mode=longdo_poi and key missing
  const actionReady =
    locMode === "none" ||
    locMode === "http" ||
    (locMode === "longdo_poi" && hasLongdoKey);

  let setupHint: string | null = null;
  if (!configured) {
    setupHint =
      "ยังไม่ได้ตั้ง LIFF_ID — สร้าง LIFF App ใน LINE Developers แล้วใส่ LIFF_ID ใน .env หรือหน้าเชื่อม LINE";
  } else if (!actionReady && locMode === "longdo_poi") {
    setupHint =
      "ยังไม่ได้ตั้ง LONGDO_API_KEY — ใส่ใน .env แล้ว restart softnix-linedev (หรือเปลี่ยน Location Action เป็น http/none)";
  }

  return NextResponse.json({
    ok: true,
    liffId,
    configured,
    actionReady,
    locationActionMode: locMode,
    /** @deprecated use actionReady — true only meaningful for longdo_poi */
    hasLongdoKey,
    publicBaseUrl: getPublicBaseUrl(),
    checkinPageUrl: getCheckinPageUrl(),
    liffOpenUrl: getLiffOpenUrl(liffId),
    setupHint,
    // NEVER: longdoApiKey, http headers/secrets, channel tokens
  });
}
