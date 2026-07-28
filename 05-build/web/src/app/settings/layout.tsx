"use client";
/**
 * [Trục B L5] User Settings — vào MENU AVATAR (Topbar), KHÔNG vào sidebar (thiết kế §3③).
 * Dùng chung StudioGate ⇒ session chia sẻ với /admin, /studio, /employee…
 */
import "../studio/studio.css";
import { ReactNode } from "react";
import { StudioGate } from "@/components/studio/StudioGate";

const QUICK = [
  ["emp1", "nhân viên"], ["mgr", "trưởng phòng"], ["admin", "tenant admin"],
] as const;

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <StudioGate section="Cài đặt tài khoản" quickRoles={[...QUICK]}>
      {children}
    </StudioGate>
  );
}
