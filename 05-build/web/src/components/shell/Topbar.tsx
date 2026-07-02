"use client";
import { Search, Moon, Sun, Languages, Bell, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useSidebar } from "@/components/providers/SidebarProvider";
import { useI18n } from "@/lib/i18n";

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
      <div className="avatar" title="Tài khoản">TP</div>
    </header>
  );
}
