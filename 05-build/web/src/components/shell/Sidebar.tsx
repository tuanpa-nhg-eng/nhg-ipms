"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, TriangleAlert, Target, ClipboardCheck, BookMarked, Sparkles,
  Network, Users, Scale, ScrollText, FileCheck, Rocket,
  Bot, UserCog, CalendarCog, Grid3x3, ShieldCheck, MessageSquareText, CalendarCheck,
  ChevronDown, SlidersHorizontal, Workflow, Building2, GitFork, Palette, BookPlus, Inbox,
  BookOpenText, ClipboardList, Gauge, Activity, LayoutList, Shield,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

const ICON = 18;
const STORAGE_KEY = "nhg-nav-groups";

export function Sidebar() {
  const path = usePathname();
  const { t } = useI18n();

  // Trạng thái thu gọn từng nhóm — nhớ qua localStorage. Mặc định: mở.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) { try { setCollapsed(JSON.parse(s)); } catch {} }
  }, []);
  const isOpen = (id: string) => collapsed[id] !== true;
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      // prev[id] === true (đang thu gọn) → mở lại; ngược lại → thu gọn
      const next = { ...prev, [id]: prev[id] !== true };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });

  const groups = [
    { id: "exec", group: t("nav.exec"), links: [
      { href: "/exec/cockpit", label: t("nav.cockpit"), icon: <LayoutDashboard size={ICON} /> },
      { href: "/exec/strategy", label: t("nav.strategy"), icon: <Network size={ICON} /> },
      { href: "/exec/cockpit#risk", label: t("nav.goalrisk"), icon: <TriangleAlert size={ICON} /> },
      { href: "/exec/talent", label: t("nav.talentrisk"), icon: <UserCog size={ICON} /> },
      { href: "/exec/ai-adoption", label: t("nav.aiadoption"), icon: <Bot size={ICON} /> },
    ]},
    { id: "work", group: t("nav.work"), links: [
      // [Trục A L2] Bàn làm việc đứng đầu nhóm: đây là trang nhân viên mở đầu ngày
      { href: "/employee", label: t("nav.workbench"), icon: <LayoutList size={ICON} /> },
      { href: "/employee/my-goals", label: t("nav.mygoals"), icon: <Target size={ICON} /> },
      { href: "/employee/check-in", label: t("nav.mycheckin"), icon: <CalendarCheck size={ICON} /> },
      { href: "/employee/review", label: t("nav.myreview"), icon: <FileCheck size={ICON} /> },
      { href: "/employee/development", label: t("nav.development"), icon: <Rocket size={ICON} /> },
    ]},
    { id: "manager", group: t("nav.manager"), links: [
      { href: "/manager/team", label: t("nav.team"), icon: <Users size={ICON} /> },
      { href: "/manager/review", label: t("nav.review"), icon: <ClipboardCheck size={ICON} /> },
      { href: "/manager/coaching", label: t("nav.coaching"), icon: <MessageSquareText size={ICON} /> },
    ]},
    { id: "hr", group: t("nav.hr"), links: [
      { href: "/hr/kpi-library", label: t("nav.kpi"), icon: <BookMarked size={ICON} /> },
      { href: "/hr/review-cycle", label: t("nav.reviewcycle"), icon: <CalendarCog size={ICON} /> },
      { href: "/hr/calibration", label: t("nav.calibration"), icon: <Scale size={ICON} /> },
      { href: "/hr/talent-matrix", label: t("nav.talentmatrix"), icon: <Grid3x3 size={ICON} /> },
      { href: "/hr/policy", label: t("nav.policy"), icon: <ShieldCheck size={ICON} /> },
    ]},
    // Configuration Studio — khu nối API thật (role-gated ở BE; sidebar mock chưa gate)
    { id: "studio", group: t("nav.studio"), links: [
      { href: "/studio", label: t("nav.studioversions"), icon: <SlidersHorizontal size={ICON} /> },
      { href: "/studio/org", label: t("nav.orgdesigner"), icon: <Building2 size={ICON} /> },
      { href: "/studio/process", label: t("nav.processdesigner"), icon: <Workflow size={ICON} /> },
      { href: "/studio/derivation", label: t("nav.derivation"), icon: <GitFork size={ICON} /> },
      { href: "/studio/brand", label: t("nav.brandkit"), icon: <Palette size={ICON} /> },
      { href: "/studio/library", label: t("nav.taskcellstudio"), icon: <BookPlus size={ICON} /> },
      { href: "/studio/curation", label: t("nav.curation"), icon: <Inbox size={ICON} /> },
      { href: "/studio/dept", label: t("nav.deptboard"), icon: <ClipboardList size={ICON} /> },
      { href: "/studio/ai-governance", label: t("nav.aigov"), icon: <Activity size={ICON} /> },
    ]},
    { id: "audit", group: t("nav.audit"), links: [
      { href: "/audit/logs", label: t("nav.auditlog"), icon: <ScrollText size={ICON} /> },
      { href: "/audit/compliance", label: t("nav.compliance"), icon: <ShieldCheck size={ICON} /> },
    ]},
    // [Trục B] Quản trị đơn vị — role-gated ở BE; nav TOÀN HỆ được gác ở L6 (chốt sổ trục).
    // Đặt trước "Tra cứu" — bất biến "Tra cứu đặt CUỐI sidebar" (mọi persona) giữ nguyên.
    { id: "admin", group: t("nav.groupadmin"), links: [
      { href: "/admin/users", label: t("nav.adminusers"), icon: <Shield size={ICON} /> },
      { href: "/admin/org", label: t("nav.adminorg"), icon: <Building2 size={ICON} /> },
    ]},
    // Tra cứu — tài nguyên tham chiếu toàn hàng, mọi persona (đặt cuối sidebar)
    { id: "reference", group: t("nav.reference"), links: [
      { href: "/dictionary", label: t("nav.taskdict"), icon: <BookOpenText size={ICON} /> },
      { href: "/kpi-dictionary", label: t("nav.kpidict"), icon: <Gauge size={ICON} /> },
    ]},
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-full" src="/logo.png" alt="NHG" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-icon" src="/icon-logo.png" alt="NHG" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/logo.png"; }} />
        <b>i<span>PMS</span></b>
      </div>

      <nav className="nav-scroll">
        {groups.map((g) => {
          const open = isOpen(g.id);
          return (
            <div key={g.id} className="nav-group">
              <button
                type="button"
                className="nav-group-head"
                onClick={() => toggle(g.id)}
                aria-expanded={open}
              >
                <span>{g.group}</span>
                <ChevronDown size={14} className={`chev${open ? " open" : ""}`} />
              </button>
              {open && g.links.map((l) => {
                const active = path === l.href.split("#")[0];
                return (
                  <Link key={l.href} href={l.href} title={l.label} className={`nav-item${active ? " active" : ""}`}>
                    <span className="ic">{l.icon}</span>
                    <span>{l.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <Sparkles size={15} /> <span>Human-led · AI-assisted</span>
      </div>
    </aside>
  );
}
