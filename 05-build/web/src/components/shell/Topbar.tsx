"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Moon, Sun, Languages, Bell, PanelLeftClose, PanelLeftOpen, Settings, ChevronDown } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useSidebar } from "@/components/providers/SidebarProvider";
import { useI18n } from "@/lib/i18n";

/**
 * [Trục B L5] Menu avatar — CHỈ điểm vào User Settings (không nhét vào sidebar, đúng thiết
 * kế §3③). Không phụ thuộc `useStudio()` — Topbar dùng ở MỌI trang, kể cả trang chưa có
 * StudioProvider bao ngoài (cùng lý do AgentPanel/ImpersonationBanner đọc thẳng
 * sessionStorage thay vì qua context).
 */
function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="avatar-menu" ref={ref}>
      <button className="avatar" title="Tài khoản" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        TP <ChevronDown size={12} />
      </button>
      {open && (
        <div className="avatar-dropdown">
          <Link href="/settings" className="avatar-dropdown-item" onClick={() => setOpen(false)}>
            <Settings size={14} /> Cài đặt tài khoản
          </Link>
        </div>
      )}
    </div>
  );
}

export function Topbar({ crumb }: { crumb: { section: string; page: string } }) {
  const { theme, toggle } = useTheme();
  const { collapsed, toggle: toggleSidebar } = useSidebar();
  const { t, toggle: toggleLang, lang } = useI18n();
  return (
    <header className="topbar">
      <button className="iconbtn" onClick={toggleSidebar} title={collapsed ? "Mở rộng menu" : "Thu gọn menu"} aria-label="toggle sidebar">
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
      <div className="crumb">{crumb.section} · <b>{crumb.page}</b></div>
      <div className="spacer" />
      <div className="search">
        <Search size={15} /> <span>{t("search")}</span>
      </div>
      <button className="iconbtn" onClick={toggleLang} title="Language" aria-label="language">
        <Languages size={16} /> {lang === "vi" ? "EN" : "VI"}
      </button>
      <button className="iconbtn" onClick={toggle} title={t("theme")} aria-label="theme">
        {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
      </button>
      <button className="iconbtn" aria-label="notifications"><Bell size={16} /></button>
      <AvatarMenu />
    </header>
  );
}
