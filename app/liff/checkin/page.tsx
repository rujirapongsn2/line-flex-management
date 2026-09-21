"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LiffConfig = {
  ok?: boolean;
  liffId?: string;
  configured?: boolean;
  setupHint?: string | null;
  hasLongdoKey?: boolean;
  actionReady?: boolean;
  locationActionMode?: string;
};

type GeoState = {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: Date;
};

type Phase =
  | "boot"
  | "need_setup"
  | "need_longdo"
  | "action_blocked"
  | "init_liff"
  | "locate"
  | "ready"
  | "submitting"
  | "done"
  | "error";

declare global {
  interface Window {
    liff?: {
      init: (opts: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ userId: string; displayName: string }>;
      isInClient: () => boolean;
      sendMessages: (messages: unknown[]) => Promise<void>;
      closeWindow: () => void;
    };
  }
}

const ACCENT = "#2786C2";

function readTagFromUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    const u = new URL(window.location.href);
    return (u.searchParams.get("tag") || u.searchParams.get("q") || "").trim();
  } catch {
    return "";
  }
}

function loadLiffSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.liff) {
      resolve();
      return;
    }
    const existing = document.querySelector(
      'script[data-linedev-liff="1"]'
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("โหลด LIFF SDK ไม่สำเร็จ"))
      );
      return;
    }
    const s = document.createElement("script");
    s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    s.async = true;
    s.dataset.linedevLiff = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("โหลด LIFF SDK ไม่สำเร็จ"));
    document.head.appendChild(s);
  });
}

function geoErrorMessage(err: GeolocationPositionError | Error): string {
  if ("code" in err) {
    if (err.code === 1) {
      return "คุณปฏิเสธการเข้าถึงตำแหน่ง กรุณาอนุญาต Location ในตั้งค่าเบราว์เซอร์/LINE แล้วลองใหม่";
    }
    if (err.code === 2) {
      return "อ่านตำแหน่งไม่ได้ (สัญญาณ GPS อ่อนหรือไม่มี) — ลองเปิด Location Services แล้วรีเฟรช";
    }
    if (err.code === 3) {
      return "หมดเวลาในการอ่านตำแหน่ง — ลองใหม่ในที่โล่งแจ้ง";
    }
  }
  return err.message || "เกิดข้อผิดพลาดขณะอ่านตำแหน่ง";
}

export default function LiffNearbyPage() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [message, setMessage] = useState("กำลังเตรียมหน้าแชร์พิกัด…");
  const [geo, setGeo] = useState<GeoState | null>(null);
  const [profile, setProfile] = useState<{
    userId: string;
    displayName: string;
  } | null>(null);
  const [setupHint, setSetupHint] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [resultCount, setResultCount] = useState<number | null>(null);

  const timeLabel = useMemo(() => {
    if (!geo) return "";
    try {
      return geo.at.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return geo.at.toISOString();
    }
  }, [geo]);

  const requestGeo = useCallback(() => {
    setPhase("locate");
    setMessage("กำลังขอตำแหน่งปัจจุบัน…");
    if (!navigator.geolocation) {
      setPhase("error");
      setMessage("อุปกรณ์นี้ไม่รองรับ Geolocation");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === "number"
              ? pos.coords.accuracy
              : null,
          at: new Date(),
        });
        setPhase("ready");
        setMessage("พบพิกัดแล้ว — กดยืนยันเพื่อค้นหาสถานที่ใกล้เคียง");
      },
      (err) => {
        setPhase("error");
        setMessage(geoErrorMessage(err));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    setTag(readTagFromUrl());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfgRes = await fetch("/api/liff/config", { cache: "no-store" });
        const cfg = (await cfgRes.json()) as LiffConfig;
        if (cancelled) return;
        if (!cfg.configured || !cfg.liffId) {
          setSetupHint(
            cfg.setupHint ||
              "ยังไม่ได้ตั้ง LIFF_ID — พี่ทอมต้องสร้าง LIFF App ใน LINE Developers"
          );
          setPhase("need_setup");
          setMessage("ยังไม่ได้ตั้งค่า LIFF");
          return;
        }
        // Prefer actionReady (supports longdo_poi | http | none). Legacy hasLongdoKey only blocks longdo mode.
        if (cfg.actionReady === false) {
          setSetupHint(
            cfg.setupHint ||
              "Location Action ยังไม่พร้อม — ตรวจ LONGDO_API_KEY หรือตั้งโหมด http/none ในหน้าเชื่อม LINE"
          );
          setPhase(
            cfg.locationActionMode === "longdo_poi" ? "need_longdo" : "action_blocked"
          );
          setMessage("Location Action ยังไม่พร้อม");
          return;
        }

        setPhase("init_liff");
        setMessage("กำลังเชื่อมต่อ LINE LIFF…");
        await loadLiffSdk();
        if (!window.liff) throw new Error("LIFF SDK ไม่พร้อม");
        await window.liff.init({ liffId: cfg.liffId });
        if (!window.liff.isLoggedIn()) {
          window.liff.login();
          return;
        }
        const p = await window.liff.getProfile();
        if (cancelled) return;
        setProfile({ userId: p.userId, displayName: p.displayName });
        requestGeo();
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setPhase("error");
        setMessage(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestGeo]);

  async function confirmSearch() {
    if (!geo || !profile) return;
    setPhase("submitting");
    setMessage("กำลังค้นหาสถานที่ใกล้เคียง…");
    try {
      const res = await fetch("/api/location/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: geo.lat,
          lon: geo.lng,
          lng: geo.lng,
          accuracy: geo.accuracy,
          userId: profile.userId,
          displayName: profile.displayName,
          tag: tag || undefined,
          limit: 10,
          span: "300m",
          // Server: Location Action + LLM/Flex LINE push
          pushReply: true,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        flex?: unknown;
        count?: number;
        needLongdoKey?: boolean;
        actionReady?: boolean;
        mode?: string;
        replyKind?: string;
        llmUsed?: boolean;
        pushed?: boolean;
      };
      if (!res.ok || !data.ok) {
        if (data.needLongdoKey) {
          setPhase("need_longdo");
          setSetupHint(data.error || null);
        }
        throw new Error(data.error || "ค้นหาไม่สำเร็จ");
      }

      setResultCount(typeof data.count === "number" ? data.count : null);

      let sentInClient = false;
      // Prefer server LINE reply (LLM/flex). Only send flex from LIFF if server did not push.
      if (!data.pushed && window.liff?.isInClient?.() && data.flex) {
        try {
          await window.liff.sendMessages([data.flex]);
          sentInClient = true;
        } catch (sendErr) {
          console.warn("liff.sendMessages failed, fallback push", sendErr);
          const pushRes = await fetch("/api/location/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: profile.userId,
              pushOnly: true,
              flex: data.flex,
            }),
          });
          const pushData = (await pushRes.json()) as {
            ok?: boolean;
            error?: string;
          };
          if (!pushRes.ok || !pushData.ok) {
            throw new Error(
              pushData.error || "ส่งการ์ดผลลัพธ์เข้าแชทไม่สำเร็จ"
            );
          }
        }
      }

      setPhase("done");
      const n = typeof data.count === "number" ? data.count : 0;
      const via =
        data.llmUsed || data.pushed
          ? " — ตอบใน LINE แล้ว"
          : sentInClient || window.liff?.isInClient?.()
            ? " — ส่งการ์ดเข้าแชทแล้ว"
            : "";
      setMessage(
        data.mode === "none"
          ? `รับพิกัดแล้ว${via}`
          : `พบ ${n} รายการ${via}`
      );
      window.setTimeout(() => {
        try {
          window.liff?.closeWindow?.();
        } catch {
          /* ignore */
        }
      }, 1400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (phase !== "need_longdo") setPhase("error");
      setMessage(msg);
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        margin: 0,
        fontFamily:
          '"Sarabun", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        background: "linear-gradient(180deg, #F0F7FC 0%, #FFFFFF 48%)",
        color: "#13202F",
        padding: "24px 18px 40px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: ACCENT,
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            SN
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              แชร์พิกัดเพื่อค้นหาใกล้เคียง
            </div>
            <div style={{ fontSize: 13, color: "#5B6B7C" }}>
              Softnix FMM · Location Action
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #D7E6F2",
            borderRadius: 16,
            padding: "18px 16px",
            boxShadow: "0 8px 24px rgba(39,134,194,0.08)",
          }}
        >
          <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.55 }}>
            {message}
          </p>

          {tag ? (
            <div
              style={{
                display: "inline-block",
                background: "#E8F4FB",
                color: ACCENT,
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              หมวด: {tag}
            </div>
          ) : null}

          {(phase === "need_setup" ||
            phase === "need_longdo" ||
            phase === "action_blocked") &&
          setupHint ? (
            <div
              style={{
                background: "#FFF8E8",
                border: "1px solid #F5C84C",
                borderRadius: 12,
                padding: 12,
                fontSize: 13,
                lineHeight: 1.5,
                color: "#7A5B00",
              }}
            >
              {setupHint}
              {phase === "need_setup" ? (
                <div style={{ marginTop: 8 }}>
                  Endpoint URL:
                  <br />
                  <code style={{ fontSize: 12 }}>
                    https://line.rujirapong.us/liff/checkin
                  </code>
                </div>
              ) : null}
            </div>
          ) : null}

          {geo &&
          (phase === "ready" || phase === "submitting" || phase === "done") ? (
            <div
              style={{
                marginTop: 8,
                background: "#F7FAFC",
                borderRadius: 12,
                padding: 12,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <div>
                <strong>พิกัด:</strong> {geo.lat.toFixed(6)},{" "}
                {geo.lng.toFixed(6)}
              </div>
              <div>
                <strong>ความแม่นยำ:</strong>{" "}
                {geo.accuracy != null
                  ? `±${Math.round(geo.accuracy)} ม.`
                  : "—"}
              </div>
              <div>
                <strong>เวลา:</strong> {timeLabel}
              </div>
              {profile ? (
                <div>
                  <strong>ผู้ใช้:</strong> {profile.displayName}
                </div>
              ) : null}
              {resultCount != null ? (
                <div>
                  <strong>ผลลัพธ์:</strong> {resultCount} แห่ง
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 16,
            }}
          >
            {phase === "ready" ? (
              <button
                type="button"
                onClick={() => void confirmSearch()}
                style={{
                  border: "none",
                  borderRadius: 12,
                  padding: "14px 16px",
                  background: ACCENT,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                ยืนยันและค้นหาใกล้เคียง
              </button>
            ) : null}

            {phase === "error" ||
            phase === "need_setup" ||
            phase === "need_longdo" ||
            phase === "action_blocked" ? (
              <button
                type="button"
                onClick={() => {
                  if (
                    phase === "need_setup" ||
                    phase === "need_longdo" ||
                    phase === "action_blocked"
                  ) {
                    window.location.reload();
                    return;
                  }
                  requestGeo();
                }}
                style={{
                  border: `1px solid ${ACCENT}`,
                  borderRadius: 12,
                  padding: "12px 16px",
                  background: "#fff",
                  color: ACCENT,
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                ลองใหม่
              </button>
            ) : null}

            {phase === "done" ? (
              <button
                type="button"
                onClick={() => {
                  try {
                    window.liff?.closeWindow?.();
                  } catch {
                    window.close();
                  }
                }}
                style={{
                  border: "none",
                  borderRadius: 12,
                  padding: "12px 16px",
                  background: "#E8F4FB",
                  color: ACCENT,
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                ปิดหน้าต่าง
              </button>
            ) : null}
          </div>
        </div>

        <p
          style={{
            marginTop: 16,
            fontSize: 12,
            color: "#8A97A5",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          ใช้ตำแหน่งจากเบราว์เซอร์ · ประมวลผล Location Action ฝั่งเซิร์ฟเวอร์
          (ไม่เปิดเผย API key / secrets บนเครื่องลูกข่าย)
        </p>
      </div>
    </main>
  );
}
