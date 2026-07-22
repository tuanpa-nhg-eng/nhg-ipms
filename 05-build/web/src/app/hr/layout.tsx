"use client";
/**
 * [Trục A — L0] Khu HR/HRBP — quản trị chu kỳ đánh giá, cân chỉnh, export bảng lương.
 * hr@ (hrbp) giữ review:manage / calibration:run / payroll:export; mgr@ KHÔNG có —
 * để nguyên như vậy, màn phải hiển thị trung thực thay vì nới quyền (I6).
 */
import "../studio/studio.css";
import { ReactNode } from "react";
import { StudioGate } from "@/components/studio/StudioGate";

const QUICK = [
  ["hr", "HRBP"], ["admin", "tenant admin"],
  ["mgr", "trưởng phòng — để thấy giới hạn quyền"],
] as const;

export default function HrLayout({ children }: { children: ReactNode }) {
  return (
    <StudioGate section="HR / Nhân sự" quickRoles={[...QUICK]}>
      {children}
    </StudioGate>
  );
}
