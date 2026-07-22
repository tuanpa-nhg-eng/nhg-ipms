"use client";
/**
 * [Trục A — L0] Khu Điều hành — chỉ ĐỌC (exec_viewer không có quyền ghi nào).
 */
import "../studio/studio.css";
import { ReactNode } from "react";
import { StudioGate } from "@/components/studio/StudioGate";

const QUICK = [
  ["exec", "điều hành (chỉ đọc)"], ["admin", "tenant admin"], ["hr", "HRBP"],
] as const;

export default function ExecLayout({ children }: { children: ReactNode }) {
  return (
    <StudioGate section="Điều hành" quickRoles={[...QUICK]}>
      {children}
    </StudioGate>
  );
}
