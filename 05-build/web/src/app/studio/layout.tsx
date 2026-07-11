"use client";
/**
 * Configuration Studio — khu vực nối API THẬT (khác các màn mock còn lại).
 * Gate đăng nhập dùng chung với /dictionary (StudioGate). Production: OIDC Entra.
 */
import "reactflow/dist/style.css";
import "./studio.css";
import { ReactNode } from "react";
import { StudioGate } from "@/components/studio/StudioGate";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <StudioGate section="Configuration Studio">{children}</StudioGate>;
}
