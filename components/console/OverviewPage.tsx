"use client";

import type { ConsoleState, PageId } from "@/lib/types";
import type { Readiness } from "./readiness";

type Props = {
  state: ConsoleState;
  readiness: Readiness;
  onNavigate: (page: PageId) => void;
  webhookUserCount: number;
  needsServerSync?: boolean;
  serverRuntime?: { ok?: boolean; hasToken?: boolean; hasApiKey?: boolean } | null;
};

export default function OverviewPage({
  state,
  readiness,
  onNavigate,
  webhookUserCount,
  needsServerSync,
}: Props) {
  const enabledCount = state.templates.filter((t) => t.enabled).length;
  const remaining = 4 - readiness.completedSteps;
  const headline = readiness.ready
    ? "พร้อมเปิดใช้งาน LINE แล้ว"
    : remaining === 1
      ? "ใกล้พร้อมแล้ว — เหลืออีก 1 ขั้นตอน"
      : `ความคืบหน้า — เหลืออีก ${remaining} ขั้นตอน`;

  const steps: {
    done: boolean;
    title: string;
    detail: string;
    page?: PageId;
    cta?: string;
    deferred?: boolean;
  }[] = [
    {
      done: readiness.agentConfigured,
      title: "ตั้งค่า Agent และ Prompt",
      detail: readiness.agentConfigured
        ? `Agent «${state.agent.name}» · โมเดล ${state.agent.model}`
        : "กรอกชื่อ · Prompt · Base URL · Model · API Key",
      page: "agent",
      cta: "ไปตั้งค่า",
    },
    {
      done: readiness.hasEnabledTemplate,
      title: "สร้างเทมเพลต Flex อย่างน้อย 1 ใบ",
      detail: readiness.hasEnabledTemplate
        ? `มี ${enabledCount} เทมเพลต · ${state.templates
            .filter((t) => t.enabled)
            .map((t) => t.conditionKey)
            .slice(0, 3)
            .join(", ")}${enabledCount > 3 ? ", …" : ""}`
        : "สร้างการ์ดที่ Agent จะส่งตามเงื่อนไข",
      page: "flex",
      cta: "ไปสร้าง",
    },
    {
      done: readiness.hasToken,
      title: "เชื่อม Channel Access Token ของ LINE",
      detail: readiness.hasToken
        ? "โทเคนบันทึกแล้ว · พร้อมส่งข้อความออก"
        : "ใส่โทเคนจาก LINE Developers Console",
      page: "line",
      cta: "ไปเชื่อม",
    },
    {
      done: readiness.webhookConfirmed,
      title: "ลงทะเบียน Webhook URL ให้ LINE",
      detail: readiness.webhookConfirmed
        ? "ยืนยันแล้วว่าลงทะเบียน Webhook แล้ว"
        : "ต้องเป็น HTTPS · คัดลอก URL ไปวางใน LINE Developers",
      page: "line",
      cta: "ดู URL",
    },
    {
      done: false,
      deferred: true,
      title: "ทดสอบส่งข้อความ (ขั้นตอนสุดท้าย)",
      detail: "ทำหลังเชื่อม LINE สำเร็จ — ไม่ใช่หน้าแรก",
      page: "sandbox",
      cta: "ไปทดสอบ",
    },
  ];

  const incomplete = steps.filter((s) => !s.done && !s.deferred);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.15fr .85fr",
        gap: 18,
      }}
    >
      <div className="stack" style={{ gap: 16 }}>
        {needsServerSync ? (
          <div
            className="card"
            style={{
              padding: "12px 16px",
              background: "var(--warn-soft)",
              borderColor: "#F5C84C",
            }}
          >
            <div className="text-sm" style={{ color: "#92400E", lineHeight: 1.5 }}>
              <strong>ยังไม่ซิงก์ขึ้นเซิร์ฟเวอร์:</strong>{" "}
              กดบันทึกอีกครั้งเพื่อซิงก์ขึ้นเซิร์ฟเวอร์สำหรับ webhook
              — ไปที่ Agent (บันทึกทั้งหมด) และ LINE (บันทึก)
            </div>
          </div>
        ) : null}
        <div className="card" style={{ padding: "20px 22px" }}>
          <div className="space-between mb-12">
            <div>
              <div className="text-sm text-muted">
                สถานะความพร้อมก่อนเปิดใช้งาน LINE
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                {headline}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)" }}
              >
                {readiness.percent}%
              </div>
              <div className="text-xs text-muted">ความคืบหน้า</div>
            </div>
          </div>
          <div className="prog-track mb-16">
            <div
              className="prog-fill"
              style={{ width: `${readiness.percent}%` }}
            />
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {steps.map((s, i) => {
              if (s.deferred) {
                return (
                  <div
                    key={i}
                    className="check-item"
                    style={{ opacity: 0.55, background: "#F8FAFC" }}
                  >
                    <div
                      className="check-ico"
                      style={{ background: "#E2E8F0", color: "#64748B" }}
                    >
                      5
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="fw-600">{s.title}</div>
                      <div className="text-sm text-muted">{s.detail}</div>
                    </div>
                    <span className="tag tag-gray">รอขั้นตอนก่อนหน้า</span>
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className={`check-item ${s.done ? "done" : "todo"}`}
                >
                  <div className="check-ico">{s.done ? "✓" : "!"}</div>
                  <div style={{ flex: 1 }}>
                    <div className="fw-600">{s.title}</div>
                    <div className="text-sm text-muted">{s.detail}</div>
                  </div>
                  {s.done ? (
                    <span className="tag tag-green">เสร็จแล้ว</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => s.page && onNavigate(s.page)}
                    >
                      {s.cta}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="fw-600 mb-12">ทางลัดไปขั้นตอนที่ยังไม่ครบ</div>
          <div className="stack" style={{ gap: 8 }}>
            {incomplete.length === 0 ? (
              <button
                type="button"
                className="btn btn-primary"
                style={{ justifyContent: "flex-start", width: "100%", padding: "12px 14px" }}
                onClick={() => onNavigate("sandbox")}
              >
                ทดสอบส่งข้อความ
              </button>
            ) : (
              incomplete.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    justifyContent: "flex-start",
                    width: "100%",
                    padding: "12px 14px",
                  }}
                  onClick={() => s.page && onNavigate(s.page)}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: "var(--warn-soft)",
                      color: "var(--warn)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </span>
                  {s.title}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="fw-600 mb-8">สรุปคอนโซล</div>
          <div className="grid-2" style={{ gap: 10 }}>
            <div style={{ background: "#F8FAFC", borderRadius: 8, padding: 12 }}>
              <div className="text-xs text-muted">เทมเพลต Flex</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {state.templates.length}
              </div>
            </div>
            <div style={{ background: "#F8FAFC", borderRadius: 8, padding: 12 }}>
              <div className="text-xs text-muted">เปิดใช้งาน</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{enabledCount}</div>
            </div>
            <div style={{ background: "#F8FAFC", borderRadius: 8, padding: 12 }}>
              <div className="text-xs text-muted">User ID ที่รู้จัก</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {webhookUserCount}
              </div>
            </div>
            <div style={{ background: "#F8FAFC", borderRadius: 8, padding: 12 }}>
              <div className="text-xs text-muted">ความพร้อม</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {readiness.percent}%
              </div>
            </div>
          </div>
        </div>

        <div
          className="card"
          style={{
            padding: "14px 18px",
            background: "var(--accent-soft)",
            borderColor: "#B9D9EF",
          }}
        >
          <div
            className="text-sm"
            style={{ color: "var(--accent-dark)", lineHeight: 1.5 }}
          >
            <strong>เคล็ดลับ:</strong> ทำตาม checklist จากบนลงล่าง — เมื่อครบแล้ว
            Agent จะพร้อมตอบลูกค้าบน LINE ด้วยการ์ด Flex ตามเงื่อนไขใน Prompt
          </div>
        </div>
      </div>
    </div>
  );
}
