"use client";

import { useEffect, useState } from "react";
import type { LineConfig } from "@/lib/types";
import type { Readiness } from "./readiness";

type WebhookUser = {
  userId: string;
  displayHint: string;
  at: string;
};

type Props = {
  line: LineConfig;
  readiness: Readiness;
  onSave: (line: LineConfig) => void;
  needsServerSync?: boolean;
  serverRuntime?: { ok?: boolean; hasToken?: boolean; hasApiKey?: boolean } | null;
};

function formatAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export default function LineConnectPage({
  line,
  readiness,
  onSave,
  needsServerSync,
}: Props) {
  const [draft, setDraft] = useState(line);
  const [showToken, setShowToken] = useState(false);
  const [users, setUsers] = useState<WebhookUser[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("/api/line/webhook");
  const [copied, setCopied] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraft(line);
  }, [line]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/line/webhook`);
    }
    void refreshUsers();
    const id = window.setInterval(() => void refreshUsers(), 8000);
    return () => window.clearInterval(id);
  }, []);

  async function refreshUsers() {
    try {
      const res = await fetch("/api/line/webhook/users");
      const data = (await res.json()) as {
        ok?: boolean;
        users?: WebhookUser[];
      };
      if (data.users) setUsers(data.users);
    } catch {
      /* ignore */
    }
  }

  function persist(next: LineConfig) {
    setDraft(next);
    onSave(next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.1fr .9fr",
        gap: 16,
      }}
    >
      <div className="stack" style={{ gap: 14 }}>
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
              กดบันทึกอีกครั้งเพื่อซิงก์ขึ้นเซิร์ฟเวอร์สำหรับ webhook
            </div>
          </div>
        ) : null}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="fw-600 mb-4">Channel Access Token</div>
          <div className="text-sm text-muted mb-12">
            จาก LINE Developers → Messaging API → Channel access token
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">โทเคน</label>
            <div className="row gap-8">
              <input
                className="input mono"
                style={{ flex: 1 }}
                type={showToken ? "text" : "password"}
                autoComplete="off"
                value={draft.channelAccessToken}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    channelAccessToken: e.target.value,
                  });
                }}
                placeholder="ใส่ Channel Access Token"
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowToken((v) => !v)}
              >
                {showToken ? "ซ่อน" : "แสดง"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => persist(draft)}
              >
                บันทึก
              </button>
            </div>
            <div className="row gap-8 mt-8">
              {readiness.hasToken ? (
                <span className="badge ok dot">โทเคนพร้อมใช้</span>
              ) : (
                <span className="badge warn dot">ยังไม่มีโทเคน</span>
              )}
              {savedFlash ? (
                <span className="text-xs text-muted">บันทึกแล้ว</span>
              ) : null}
            </div>
            <div className="hint">
              กดบันทึกจะซิงก์ขึ้นเซิร์ฟเวอร์ให้ webhook ใช้ตอบกลับ
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="fw-600 mb-4">Channel Secret (ถ้ามี)</div>
          <div className="field" style={{ margin: 0 }}>
            <input
              className="input mono"
              type="password"
              autoComplete="off"
              value={draft.channelSecret}
              onChange={(e) =>
                setDraft({ ...draft, channelSecret: e.target.value })
              }
              placeholder="ทางเลือก — สำหรับตรวจลายเซ็น webhook"
            />
            <div className="hint mt-8">
              หรือตั้ง LINE_CHANNEL_SECRET ใน env
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-8"
              onClick={() => persist(draft)}
            >
              บันทึก Secret
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="fw-600 mb-4">Webhook URL</div>
          <div className="text-sm text-muted mb-12">
            คัดลอกไปวางใน LINE Developers · ต้องเป็น HTTPS (เช่น Tailscale
            Funnel / ngrok)
          </div>
          <div className="row gap-8">
            <input
              className="input mono"
              style={{ flex: 1, background: "#F8FAFC" }}
              readOnly
              value={webhookUrl}
            />
            <button type="button" className="btn btn-primary" onClick={copyUrl}>
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
          </div>
          <div className="mt-12" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {readiness.webhookConfirmed ? (
              <span className="badge ok dot">ยืนยัน Webhook แล้ว</span>
            ) : (
              <span className="badge warn dot">ยังไม่ได้ยืนยันจาก LINE</span>
            )}
            <span className="tag tag-gray">ต้อง HTTPS</span>
          </div>
          <div className="mt-12">
            <button
              type="button"
              className="btn btn-outline-accent"
              onClick={() =>
                persist({ ...draft, webhookConfirmed: true })
              }
              disabled={draft.webhookConfirmed}
            >
              ฉันลงทะเบียน Webhook แล้ว
            </button>
            {draft.webhookConfirmed ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 8 }}
                onClick={() =>
                  persist({ ...draft, webhookConfirmed: false })
                }
              >
                ยกเลิกการยืนยัน
              </button>
            ) : null}
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
            <strong>ลำดับแนะนำ:</strong> 1) ใส่โทเคน → 2) คัดลอก Webhook URL
            ไปลงทะเบียน → 3) ให้ลูกค้าทัก Agent ครั้งหนึ่ง เพื่อให้ระบบจำ User ID
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
      >
        <div
          className="space-between"
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div className="fw-600">User ID ที่เรียนรู้จาก Webhook</div>
            <div className="text-xs text-muted">อัปเดตเมื่อมีข้อความเข้า</div>
          </div>
          <span className="tag tag-blue">{users.length} คน</span>
        </div>
        {users.length === 0 ? (
          <div className="empty" style={{ padding: 32 }}>
            <div className="text-sm">
              ยังไม่มี User ID — ลงทะเบียน Webhook แล้วให้มีคนทักบอทครั้งหนึ่ง
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-12"
              onClick={() => void refreshUsers()}
            >
              รีเฟรช
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ชื่อที่แสดง</th>
                <th>User ID</th>
                <th>ล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId}>
                  <td>
                    <div className="row gap-8">
                      <div
                        className="avatar"
                        style={{ width: 26, height: 26, fontSize: 10 }}
                      >
                        {(u.displayHint || u.userId).slice(0, 1)}
                      </div>
                      {u.displayHint || "ผู้ใช้ LINE"}
                    </div>
                  </td>
                  <td>
                    <span className="code-pill">
                      {u.userId.length > 12
                        ? `${u.userId.slice(0, 5)}…${u.userId.slice(-4)}`
                        : u.userId}
                    </span>
                  </td>
                  <td className="text-xs text-muted">{formatAt(u.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
