"use client";
/**
 * [Trục A — L0] Khu Trưởng phòng. mgr@ để scope ORG_UNIT — chỉ thấy người trong phòng
 * mình, đúng bất biến I1 (không đọc chéo) và I3 (không tự duyệt chính mình).
 */
import "../studio/studio.css";
import { ReactNode } from "react";
import { StudioGate } from "@/components/studio/StudioGate";

const QUICK = [
  ["mgr", "trưởng phòng (scope phòng)"], ["hr", "HRBP (scope tenant)"],
  ["demo1", "nhân viên — để thấy 403 đúng"],
] as const;

export default function ManagerLayout({ children }: { children: ReactNode }) {
  return (
    <StudioGate section="Trưởng phòng" quickRoles={[...QUICK]}>
      {children}
    </StudioGate>
  );
}
