"use client";
/**
 * [Trục A — L0] Khu Kiểm toán/Tuân thủ.
 *
 * [I6] CHỈ `auditor@` đọc được audit log: role auditor có `audit:read`, còn
 * tenant_admin CỐ Ý KHÔNG có (seed.ts — `PERMISSIONS.filter(p => p !== 'audit:read')`).
 * Đây là SoD, không phải thiếu sót seed: người quản trị hệ thống không được tự đọc
 * (và do đó tự kiểm) vết của chính mình. admin@ để trong danh sách quick-login CHÍNH
 * LÀ để thấy 403 đúng thiết kế — tuyệt đối không vá bằng cách cấp thêm quyền.
 */
import "../studio/studio.css";
import { ReactNode } from "react";
import { StudioGate } from "@/components/studio/StudioGate";

const QUICK = [
  ["auditor", "kiểm toán viên (audit:read)"],
  ["admin", "tenant admin — KHÔNG có audit:read"],
] as const;

export default function AuditLayout({ children }: { children: ReactNode }) {
  return (
    <StudioGate section="Kiểm toán" quickRoles={[...QUICK]}>
      {children}
    </StudioGate>
  );
}
