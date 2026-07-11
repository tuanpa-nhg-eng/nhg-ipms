"use client";
/**
 * Từ điển Tác vụ — khu tra cứu canonical (read-only), nối API THẬT.
 * Tài nguyên tham chiếu TOÀN HÀNG: mọi persona đọc được (permission taskdict:read).
 * Dùng chung StudioGate ⇒ session chia sẻ với Configuration Studio.
 */
import "../studio/studio.css";
import "./dictionary.css";
import { ReactNode } from "react";
import { StudioGate } from "@/components/studio/StudioGate";

// Quick-login ưu tiên persona thường (emp1) — chứng minh "ai cũng tra cứu được"
const QUICK = [
  ["emp1", "nhân viên"], ["dept", "trưởng phòng"],
  ["author", "BU soạn"], ["admin", "tenant admin"],
] as const;

export default function DictionaryLayout({ children }: { children: ReactNode }) {
  return (
    <StudioGate section="Từ điển Tác vụ" quickRoles={[...QUICK]}>
      {children}
    </StudioGate>
  );
}
