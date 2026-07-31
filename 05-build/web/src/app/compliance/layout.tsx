"use client";
/**
 * [Trục C — L4] Khu Tuân thủ.
 *
 * Tách khỏi khu Kiểm toán (`/audit/*`) có chủ đích, không phải để cho gọn URL: hai khu phục vụ
 * hai vai khác nhau và hai quyền khác nhau. B0 (`auditor`) SOÁT — giữ `audit:read`, đọc nhật ký
 * gốc. B5 (`data_steward`) XỬ LÝ — giữ `risk:read` + `incident:manage` nhưng **cố ý KHÔNG có**
 * `audit:read` (J3). Gộp hai khu lại thì hoặc phải cấp `audit:read` cho B5 (phá J3), hoặc B5
 * mở khu ra và ăn 403 ở nửa số màn.
 *
 * Quick-login liệt kê CẢ HAI vai để người xem thấy được đúng khác biệt đó khi bấm thử.
 */
import "../studio/studio.css";
import { ReactNode } from "react";
import { StudioGate } from "@/components/studio/StudioGate";

const QUICK = [
  ["steward", "chủ dữ liệu / tuân thủ — xử lý sự cố (incident:manage)"],
  ["auditor", "kiểm toán viên — soát, KHÔNG xử lý"],
  ["exec", "điều hành — chỉ bản tổng hợp, KHÔNG đọc chi tiết cờ"],
] as const;

export default function ComplianceLayout({ children }: { children: ReactNode }) {
  return (
    <StudioGate section="Tuân thủ" quickRoles={[...QUICK]}>
      {children}
    </StudioGate>
  );
}
