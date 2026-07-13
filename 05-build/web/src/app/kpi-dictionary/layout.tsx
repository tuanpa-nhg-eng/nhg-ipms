"use client";
/**
 * Từ điển KPI chuẩn — khu tra cứu (read-only) nối API THẬT, dùng chung StudioGate
 * ⇒ session chia sẻ với /studio và /dictionary. 20 metric chuẩn (Semantic Dictionary):
 * mọi tác vụ active/canonical phải gắn 1 mã trong đây (Q1 chặn cứng).
 */
import "../studio/studio.css";
import "../dictionary/dictionary.css";
import "./kpi-dictionary.css";
import { ReactNode } from "react";
import { StudioGate } from "@/components/studio/StudioGate";

const QUICK = [
  ["emp1", "nhân viên"], ["dept", "trưởng phòng"],
  ["author", "BU soạn"], ["admin", "tenant admin"],
] as const;

export default function KpiDictionaryLayout({ children }: { children: ReactNode }) {
  return (
    <StudioGate section="Từ điển KPI" quickRoles={[...QUICK]}>
      {children}
    </StudioGate>
  );
}
