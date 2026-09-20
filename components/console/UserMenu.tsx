"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onProfile: () => void;
};

export default function UserMenu({ onProfile }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    window.location.href = "/login";
  }

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="avatar avatar-btn"
        aria-label="เมนูผู้ใช้"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        อ
      </button>
      {open ? (
        <div className="user-menu-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onProfile();
            }}
          >
            โปรไฟล์
          </button>
          <button type="button" role="menuitem" className="danger" onClick={logout}>
            ออกจากระบบ
          </button>
        </div>
      ) : null}
    </div>
  );
}
