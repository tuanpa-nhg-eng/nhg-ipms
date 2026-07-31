"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, TriangleAlert, Target, ClipboardCheck, BookMarked, Sparkles,
  Network, Users, Scale, ScrollText, FileCheck, Rocket,
  Bot, UserCog, CalendarCog, Grid3x3, ShieldCheck, MessageSquareText, CalendarCheck,
  ChevronDown, SlidersHorizontal, Workflow, Building2, GitFork, Palette, BookPlus, Inbox,
  BookOpenText, ClipboardList, Gauge, Activity, LayoutList, Shield, Settings2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useStudio } from "@/lib/studio";
import { MeAccessResponse } from "@/lib/api";

const ICON = 18;
const STORAGE_KEY = "nhg-nav-groups";

/**
 * [Trục B L6 — đóng lỗ B-b] Trước lát này, `Sidebar` dựng `groups` CỐ ĐỊNH — nhân viên
 * thường đăng nhập vẫn thấy đủ menu Studio/HR/Kiểm toán/Điều hành, bấm vào ăn 403 (đúng cạm
 * bẫy §9 soi ngược: "hiện nút mà API sẽ từ chối" — vi phạm I3).
 *
 * Gate theo ROLE CODE (từ `GET /me/access`, mọi role đều gọi được — access.self:read cấp
 * cho tất cả), KHÔNG theo permission string thô như câu chữ kế hoạch gợi ý ban đầu. Lý do
 * tự phát hiện khi cài: permission của `employee` là TẬP CON MỞ RỘNG của `exec_viewer`
 * (kpi:read/scorecard:read/strategy:read/goal:read employee đều có — vì mỗi người đọc
 * ĐƯỢC mục tiêu của chính mình) — gate theo permission thô sẽ KHÔNG loại được nhân viên
 * khỏi menu Điều hành, đúng cái tiêu chí PASS cứng của trục cấm. RoleCode tránh được nhầm
 * lẫn này triệt để và khớp đúng ranh giới persona đã thiết kế từ đầu dự án.
 */
const GROUP_ROLES: Record<string, string[]> = {
  exec: ["exec_viewer"],
  work: ["employee", "manager"],
  manager: ["manager"],
  hr: ["hrbp"],
  studio: ["config_designer", "config_approver", "bu_author", "library_curator", "staff_author", "dept_head"],
  // [Trục C L2b] `support` vào nhóm này để tới được màn Người dùng & Vai trò — nơi duy nhất
  // có nút "Đóng vai". Không có dòng này thì vai hỗ trợ kỹ thuật giữ `user:impersonate` mà
  // không có đường nào bấm được nó từ giao diện (đúng loại lỗ "API có, UI không tới" mà
  // trục B tồn tại để đóng). Các link còn lại trong nhóm gate hẹp hơn ở dưới.
  admin: ["tenant_admin", "org_admin", "support"],
  audit: ["auditor"], // [J3] tenant_admin CỐ Ý không có audit:read — không được vào danh sách này
  // [Trục C L4] Khu tuân thủ — B5 (`data_steward`) và B0 (`auditor`) cùng vào, nhưng vì hai
  // lý do khác nhau: B5 XỬ LÝ sự cố, B0 SOÁT. Tách khỏi nhóm "audit" vì `data_steward` KHÔNG
  // có `audit:read` (J3) nên không được thấy màn Audit Log.
  compliance: ["data_steward", "auditor"],
  // "reference" không có trong map = luôn hiện (taskdict:read cấp cho MỌI role, seed.ts)
};

export function Sidebar() {
  const path = usePathname();
  const { t } = useI18n();
  const { call, ready: studioReady } = useStudio();

  // [Fail-closed] Mặc định null (chưa biết) — nhóm role-gated KHÔNG hiện cho tới khi biết
  // chắc vai của mình, tránh một khung nhấp nháy menu "đầy đủ" rồi mới thu hẹp lại (flash
  // of forbidden nav) mà người quan sát nhanh tay có thể bấm trúng trước khi ẩn.
  const [myRoles, setMyRoles] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!studioReady) return;
    call<MeAccessResponse>("/me/access")
      .then((r) => setMyRoles(new Set(r.roles.map((x) => x.roleCode))))
      .catch(() => setMyRoles(new Set())); // lỗi mạng/quyền → fail-closed, không hiện gì thêm
  }, [call, studioReady]);
  const canSeeGroup = (id: string) => {
    const need = GROUP_ROLES[id];
    if (!need) return true; // "reference" — mọi persona
    if (!myRoles) return false; // chưa biết — ẩn (fail-closed)
    return need.some((r) => myRoles.has(r));
  };

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
    // Configuration Studio — khu nối API thật, role-gated CẢ BE lẫn sidebar (L6).
    // [F186 — Reviewer đối kháng] Nhóm "studio" gộp 6 vai trò rất khác quyền nhau (SoD theo
    // TỪNG màn, không phải theo cả khu). Gate NHÓM chỉ quyết hiện/ẩn cả cụm; gate TỪNG LINK
    // (dưới, field `roles`) mới quyết ai trong cụm đó thấy màn nào — khớp đúng permission
    // GET đầu tiên màn đó gọi (xem admin-roles.controller.ts + derivation/process/library/
    // taskloop/ai controllers), không suy đoán.
    { id: "studio", group: t("nav.studio"), links: [
      { href: "/studio", label: t("nav.studioversions"), icon: <SlidersHorizontal size={ICON} />,
        roles: ["config_designer", "config_approver", "library_curator"] }, // GET /config-versions → config:read
      { href: "/studio/org", label: t("nav.orgdesigner"), icon: <Building2 size={ICON} />,
        roles: ["config_designer"] }, // GET /org-functions → org:design
      { href: "/studio/process", label: t("nav.processdesigner"), icon: <Workflow size={ICON} />,
        roles: ["config_designer"] }, // GET /processes → process:design
      { href: "/studio/derivation", label: t("nav.derivation"), icon: <GitFork size={ICON} />,
        roles: ["config_designer"] }, // GET /derivation-rules → derivation:run
      { href: "/studio/brand", label: t("nav.brandkit"), icon: <Palette size={ICON} />,
        roles: ["config_designer", "config_approver", "library_curator"] }, // GET /brand-kit → config:read
      { href: "/studio/library", label: t("nav.taskcellstudio"), icon: <BookPlus size={ICON} />,
        roles: ["bu_author", "staff_author"] }, // GET /library/contributions → library:submit
      { href: "/studio/curation", label: t("nav.curation"), icon: <Inbox size={ICON} />,
        roles: ["library_curator", "dept_head"] }, // GET /library/queue → library:curate
      { href: "/studio/dept", label: t("nav.deptboard"), icon: <ClipboardList size={ICON} />,
        roles: ["dept_head"] }, // GET /task-board → taskcell:approve
      { href: "/studio/ai-governance", label: t("nav.aigov"), icon: <Activity size={ICON} />,
        roles: ["config_designer"] }, // GET /ai/learning/stats,/ai/eval/* → ai:eval
    ]},
    { id: "compliance", group: t("nav.compliance"), links: [
      { href: "/compliance/risk", label: t("nav.risk"), icon: <TriangleAlert size={ICON} /> },
    ]},
    { id: "audit", group: t("nav.audit"), links: [
      { href: "/audit/logs", label: t("nav.auditlog"), icon: <ScrollText size={ICON} /> },
      { href: "/audit/compliance", label: t("nav.compliance"), icon: <ShieldCheck size={ICON} /> },
    ]},
    // [Trục B] Quản trị đơn vị — role-gated CẢ BE lẫn sidebar (L6, đóng lỗ B-b).
    // Đặt trước "Tra cứu" — bất biến "Tra cứu đặt CUỐI sidebar" (mọi persona) giữ nguyên.
    { id: "admin", group: t("nav.groupadmin"), links: [
      { href: "/admin/users", label: t("nav.adminusers"), icon: <Shield size={ICON} /> },
      // [J4 — Trục C L2b] `support` KHÔNG thấy link này: đây là màn SỬA cơ cấu (tạo/đổi/lưu
      // trữ đơn vị, đều đòi org:write mà vai hỗ trợ không có). Hiện nó ra sẽ là một màn mở
      // được nhưng bấm gì cũng 403 — đúng thứ J4 cấm.
      { href: "/admin/org", label: t("nav.adminorg"), icon: <Building2 size={ICON} />,
        roles: ["tenant_admin", "org_admin"] },
      // [J4] org_admin không giữ tenant.config:read/update (khác /admin/users, /admin/org
      // mà org_admin có việc thật) — chỉ tenant_admin mới thấy link này, dù cả nhóm hiện.
      { href: "/admin/config", label: t("nav.adminconfig"), icon: <Settings2 size={ICON} />, roles: ["tenant_admin"] },
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
        {groups.filter((g) => canSeeGroup(g.id)).map((g) => {
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
              {open && g.links.filter((l) => {
                // [J4] link con có `roles` RIÊNG (hẹp hơn cả nhóm) — vd /admin/config chỉ
                // tenant_admin, dù nhóm "Quản trị đơn vị" hiện cho cả org_admin.
                const linkRoles = (l as { roles?: string[] }).roles;
                if (!linkRoles) return true;
                if (!myRoles) return false;
                return linkRoles.some((r) => myRoles.has(r));
              }).map((l) => {
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
