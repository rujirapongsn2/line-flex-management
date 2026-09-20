"use client";

import type { ConsoleTemplate } from "@/lib/types";

type Props = {
  templates: ConsoleTemplate[];
  onCreate: () => void;
  onEdit: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
};

export default function FlexListPage({
  templates,
  onCreate,
  onEdit,
  onToggle,
}: Props) {
  if (templates.length === 0) {
    return (
      <div className="card empty" style={{ marginTop: 24 }}>
        <div className="empty-ico">▦</div>
        <div className="fw-600" style={{ color: "var(--text)", marginBottom: 6 }}>
          ยังไม่มีเทมเพลต Flex
        </div>
        <div className="text-sm text-muted mb-16">
          สร้างการ์ดแรกที่ Agent จะส่งเมื่อลูกค้าพูดตรงเงื่อนไขใน Prompt
          <br />
          <span style={{ color: "var(--accent-dark)" }}>
            ออกแบบใน Flex Simulator แล้ววาง JSON ที่นี่
          </span>
        </div>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          สร้างเทมเพลตแรก
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="space-between mb-16">
        <div className="text-sm text-muted">
          จัดการการ์ดที่ Agent จะส่งบน LINE ตามเงื่อนไขใน Prompt
          <br />
          <span style={{ color: "var(--accent-dark)" }}>
            ออกแบบใน Flex Simulator แล้ววาง JSON ที่นี่
          </span>
        </div>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          + สร้างเทมเพลตใหม่
        </button>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "18%" }}>ชื่อการ์ด</th>
              <th style={{ width: "18%" }}>รหัสการ์ด</th>
              <th>คำอธิบายกรณีการใช้งาน</th>
              <th style={{ width: "10%" }}>สถานะ</th>
              <th style={{ width: "10%" }}>ตัวแปร</th>
              <th style={{ width: "12%" }} />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td className="fw-600">{t.displayNameTh}</td>
                <td>
                  <span className="code-pill">{t.conditionKey}</span>
                </td>
                <td className="text-sm text-muted">{t.modelDescription}</td>
                <td>
                  <button
                    type="button"
                    className={`tag ${t.enabled ? "tag-green" : "tag-gray"}`}
                    style={{ border: "none", cursor: "pointer" }}
                    onClick={() => onToggle(t.id, !t.enabled)}
                    title="สลับเปิด/ปิด"
                  >
                    {t.enabled ? "เปิด" : "ปิด"}
                  </button>
                </td>
                <td>
                  <span className="tag tag-gray">{t.variables.length}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onEdit(t.id)}
                  >
                    แก้ไข
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="card mt-16"
        style={{
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "#F8FAFC",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
          }}
        >
          i
        </div>
        <div className="text-sm text-muted" style={{ lineHeight: 1.45 }}>
          แต่ละเทมเพลตมี{" "}
          <strong style={{ color: "var(--text)" }}>รหัสการ์ด</strong> ที่
          Prompt อ้างถึง — เมื่อลูกค้าพูดตรงเงื่อนไข Agent จะเลือกการ์ดนั้นส่งบน
          LINE
        </div>
      </div>
    </>
  );
}
