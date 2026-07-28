"use client";
/**
 * [Trục B] Khu Quản trị đơn vị — /admin/*. Dùng chung StudioGate ⇒ session chia sẻ với
 * /studio, /dictionary, /employee… (đăng nhập một lần, mở khu nào cũng còn phiên).
 * Quick-login CÓ `orgadmin@` — vai duy nhất chứng minh được J1②/J5 (scope org_unit,
 * không thấy hireDate/seniorityMonths) mà các khu khác không cần tới.
 */
import "../studio/studio.css";
import { ReactNode } from "react";
import { StudioGate } from "@/components/studio/StudioGate";

const QUICK = [
  ["admin", "tenant admin"], ["orgadmin", "org admin — 1 phòng"],
  ["emp1", "nhân viên — để thấy giới hạn quyền"],
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <StudioGate section="Quản trị đơn vị" quickRoles={[...QUICK]}>
      {children}
    </StudioGate>
  );
}
