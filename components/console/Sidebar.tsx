"use client";

import type { ReactNode } from "react";
import type { PageId } from "@/lib/types";

const ICONS: Record<string, ReactNode> = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  agent: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  ),
  flex: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </svg>
  ),
  line: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.5 8.5 0 01-12.7 7.4L3 21l2.2-5.1A8.5 8.5 0 1121 11.5z" />
    </svg>
  ),
  sandbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
      <path d="M16 11l2 2 4-4" />
    </svg>
  ),
};

const ITEMS: { id: PageId; label: string; icon: string }[] = [
  { id: "overview", label: "ภาพรวม", icon: "overview" },
  { id: "agent", label: "Agent", icon: "agent" },
  { id: "flex", label: "เทมเพลต Flex", icon: "flex" },
  { id: "line", label: "การเชื่อม LINE", icon: "line" },
  { id: "sandbox", label: "ทดสอบส่งข้อความ", icon: "sandbox" },
];

type Props = {
  page: PageId;
  onNavigate: (page: PageId) => void;
};

export default function Sidebar({ page, onNavigate }: Props) {
  const active = page === "flex-edit" ? "flex" : page;

  return (
    <aside className="sidebar">
      <div className="brand">
        <img
          className="brand-logo"
          src="/logo-softnix.png"
          alt="Softnix"
          width={120}
          height={40}
        />
        <div className="brand-text">
          <strong>FMM by Softnix</strong>
        </div>
      </div>
      <nav className="nav">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${active === item.id ? " active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="ico">{ICONS[item.icon]}</span>
            {item.label}
          </button>
        ))}
        <div className="nav-divider" role="separator" />
        <button
          type="button"
          className={`nav-item${active === "profile" ? " active" : ""}`}
          onClick={() => onNavigate("profile")}
        >
          <span className="ico">{ICONS.profile}</span>
          โปรไฟล์
        </button>
      </nav>
    </aside>
  );
}
