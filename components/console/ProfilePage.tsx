"use client";

import { FormEvent, useState } from "react";

type Props = {
  username: string;
};

export default function ProfilePage({ username }: Props) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPassword !== confirm) {
      setMsg({ kind: "err", text: "รหัสผ่านใหม่กับยืนยันไม่ตรงกัน" });
      return;
    }
    if (newPassword.length < 8) {
      setMsg({ kind: "err", text: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg({ kind: "err", text: data.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ" });
        return;
      }
      setCurrent("");
      setNew("");
      setConfirm("");
      setMsg({ kind: "ok", text: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" });
    } catch {
      setMsg({ kind: "err", text: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้" });
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    window.location.href = "/login";
  }

  return (
    <div className="stack" style={{ maxWidth: 480 }}>
      <div className="card" style={{ padding: "18px 20px" }}>
        <div className="fw-600 mb-8">บัญชีผู้ใช้</div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">ชื่อผู้ใช้</label>
          <input className="input" value={username} readOnly disabled />
        </div>
      </div>

      <form
        className="card"
        style={{ padding: "18px 20px" }}
        onSubmit={onSubmit}
      >
        <div className="fw-600 mb-12">เปลี่ยนรหัสผ่าน</div>
        <div className="field">
          <label className="label" htmlFor="cur-pass">
            รหัสผ่านปัจจุบัน
          </label>
          <input
            id="cur-pass"
            className="input"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="new-pass">
            รหัสผ่านใหม่
          </label>
          <input
            id="new-pass"
            className="input"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="confirm-pass">
            ยืนยันรหัสผ่านใหม่
          </label>
          <input
            id="confirm-pass"
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {msg ? (
          <div
            className={msg.kind === "ok" ? "success-banner" : "login-error"}
            style={{ marginBottom: 12 }}
          >
            {msg.kind === "ok" ? (
              <>
                <div className="ok-ico">✓</div>
                <div>{msg.text}</div>
              </>
            ) : (
              msg.text
            )}
          </div>
        ) : null}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}
        </button>
      </form>

      <div className="card" style={{ padding: "18px 20px" }}>
        <div className="fw-600 mb-8">เซสชัน</div>
        <p className="text-sm text-muted mb-12">
          ออกจากระบบเพื่อล้างคุกกี้เซสชันบนเบราว์เซอร์นี้
        </p>
        <button type="button" className="btn btn-secondary" onClick={logout}>
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}
