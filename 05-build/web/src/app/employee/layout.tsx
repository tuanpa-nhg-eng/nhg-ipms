"use client";
/**
 * [Trục A — L0] Khu Nhân viên. Trước trục này các màn persona chạy mock nên KHÔNG có
 * cổng đăng nhập; nối API thật thì mọi màn đều cần phiên (guard pipeline TDD §11).
 * Dùng chung StudioGate ⇒ session chia sẻ với /studio và /dictionary.
 */
import "../studio/studio.css";
import { ReactNode } from "react";
import { StudioGate } from "@/components/studio/StudioGate";

// demo1..demo3: nhân sự do seed:perfdemo dựng (có goal/check-in/review thật).
// emp1: nhân viên seed gốc — CHƯA có dữ liệu hiệu suất, giữ lại để thấy trạng thái rỗng.
const QUICK = [
  ["demo1", "nhân viên (có dữ liệu)"], ["demo3", "nhân viên (đang tự đánh giá)"],
  ["demo5", "nhân viên (mục tiêu chậm)"], ["emp1", "nhân viên (trống)"],
] as const;

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  return (
    <StudioGate section="Nhân viên" quickRoles={[...QUICK]}>
      {children}
    </StudioGate>
  );
}
