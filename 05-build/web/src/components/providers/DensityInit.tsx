"use client";
/** [Trục B L5] Áp `data-density` đã lưu ngay khi app tải — cùng khuôn ThemeProvider. */
import { useEffect } from "react";
import { applyDensity, getDensity } from "@/lib/density";

export function DensityInit() {
  useEffect(() => { applyDensity(getDensity()); }, []);
  return null;
}
