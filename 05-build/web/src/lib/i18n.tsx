"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Lang = "vi" | "en";

// Lightweight i18n cho scaffold. Bản production: chuyển sang next-intl theo TDD §13.
const dict = {
  vi: {
    "nav.exec": "Điều hành",
    "nav.cockpit": "Tổng quan điều hành",
    "nav.goalrisk": "Goal-at-Risk",
    "nav.strategy": "Phân rã mục tiêu",
    "nav.work": "Nhân viên",
    "nav.mygoals": "Mục tiêu của tôi",
    "nav.myreview": "Đánh giá của tôi",
    "nav.development": "Kế hoạch phát triển",
    "nav.manager": "Quản lý",
    "nav.team": "Đội của tôi (Check-in)",
    "nav.review": "Đánh giá (Review)",
    "nav.hr": "HR / B1",
    "nav.kpi": "Thư viện KPI",
    "nav.calibration": "Phòng cân chỉnh đánh giá",
    "nav.audit": "Kiểm toán / BOC",
    "nav.auditlog": "Audit Log",
    "nav.talentrisk": "Rủi ro nhân tài",
    "nav.aiadoption": "Ứng dụng AI",
    "nav.mycheckin": "Cập nhật tiến độ",
    "nav.coaching": "Ghi chú coaching",
    "nav.reviewcycle": "Thiết lập chu kỳ",
    "nav.talentmatrix": "Ma trận nhân tài",
    "nav.policy": "Quản trị chính sách",
    "nav.compliance": "Tuân thủ",
    "nav.studio": "Configuration Studio",
    "nav.studioversions": "Phiên bản cấu hình",
    "nav.orgdesigner": "Sơ đồ tổ chức",
    "nav.processdesigner": "Thiết kế quy trình",
    "nav.derivation": "Kéo theo KPI",
    "nav.brandkit": "Thương hiệu",
    "nav.taskcellstudio": "Soạn Task Cell",
    "nav.curation": "Kiểm duyệt thư viện",
    "search": "Tìm goal, người, evidence…",
    "theme": "Giao diện",
    "lang": "EN",
  },
  en: {
    "nav.exec": "Executive",
    "nav.cockpit": "Performance Cockpit",
    "nav.goalrisk": "Goal-at-Risk",
    "nav.strategy": "Strategy Cascade",
    "nav.work": "Employee",
    "nav.mygoals": "My Goals",
    "nav.myreview": "My Review",
    "nav.development": "Development Plan",
    "nav.manager": "Manager",
    "nav.team": "My Team (Check-in)",
    "nav.review": "Review",
    "nav.hr": "HR / B1",
    "nav.kpi": "KPI Library",
    "nav.calibration": "Calibration Room",
    "nav.audit": "Audit / BOC",
    "nav.auditlog": "Audit Log",
    "nav.talentrisk": "Talent Risk",
    "nav.aiadoption": "AI Adoption",
    "nav.mycheckin": "My Check-ins",
    "nav.coaching": "Coaching Notes",
    "nav.reviewcycle": "Review Cycle Setup",
    "nav.talentmatrix": "Talent Matrix",
    "nav.policy": "Policy Management",
    "nav.compliance": "Compliance",
    "nav.studio": "Configuration Studio",
    "nav.studioversions": "Config Versions",
    "nav.orgdesigner": "Org Designer",
    "nav.processdesigner": "Process Designer",
    "nav.derivation": "Derivation Engine",
    "nav.brandkit": "Brand Kit",
    "nav.taskcellstudio": "Task Cell Studio",
    "nav.curation": "Curation Queue",
    "search": "Search goals, people, evidence…",
    "theme": "Theme",
    "lang": "VI",
  },
} as const;

type Key = keyof (typeof dict)["vi"];
const Ctx = createContext<{ lang: Lang; t: (k: Key) => string; toggle: () => void }>({
  lang: "vi",
  t: (k) => k,
  toggle: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("vi");
  useEffect(() => {
    const saved = (localStorage.getItem("nhg-lang") as Lang) || "vi";
    setLang(saved);
  }, []);
  const toggle = () => {
    setLang((p) => {
      const n = p === "vi" ? "en" : "vi";
      localStorage.setItem("nhg-lang", n);
      document.documentElement.lang = n;
      return n;
    });
  };
  const t = (k: Key) => dict[lang][k] ?? k;
  return <Ctx.Provider value={{ lang, t, toggle }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
