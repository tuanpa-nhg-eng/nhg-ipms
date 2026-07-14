"use client";
/**
 * [P1] Mount Copilot MỘT lần duy nhất ở root layout (tách khỏi AppShell để tránh
 * double-mount khi AppShell lồng nhau — vd StudioGate cũng render AppShell).
 * Ngữ cảnh trang lấy từ pathname.
 */
import { usePathname } from "next/navigation";
import { AgentPanel } from "./AgentPanel";
import "./copilot.css";

const PAGE_LABELS: Record<string, string> = {
  cockpit: "Tổng quan điều hành", strategy: "Phân rã mục tiêu", talent: "Rủi ro nhân tài",
  "ai-adoption": "Ứng dụng AI", "my-goals": "Mục tiêu của tôi", "check-in": "Check-in",
  review: "Đánh giá", development: "Phát triển", team: "Đội của tôi", coaching: "Coaching",
  "kpi-library": "Thư viện KPI", "review-cycle": "Chu kỳ đánh giá", calibration: "Cân chỉnh",
  "talent-matrix": "Ma trận nhân tài", policy: "Chính sách", logs: "Nhật ký", compliance: "Tuân thủ",
  dictionary: "Từ điển Tác vụ", "kpi-dictionary": "Từ điển KPI", studio: "Configuration Studio",
  dept: "Bàn làm việc Trưởng phòng", library: "Soạn Task Cell", curation: "Kiểm duyệt",
  derivation: "Kéo theo KPI", brand: "Thương hiệu", org: "Sơ đồ tổ chức", process: "Quy trình",
};

export function CopilotMount() {
  const path = usePathname();
  const seg = path.split("/").filter(Boolean);
  const last = seg[seg.length - 1] ?? "";
  const page = PAGE_LABELS[last] ?? (last ? last : "Trang chủ");
  return <AgentPanel page={page} />;
}
