"use client";
/**
 * [Trục B L5] Mật độ hiển thị (compact/comfortable) — không đủ trọng lượng để dựng hẳn một
 * React context riêng như theme/lang (chỉ MỘT nơi đọc: CSS attribute selector trên
 * <html>). localStorage y hệt khuôn ThemeProvider — đổi máy thì mất, nhưng Settings/Tuỳ
 * chọn lưu server-side (app_user.preferences) nên áp lại đúng giá trị khi tải trang mới.
 */
export type Density = "compact" | "comfortable";
const KEY = "nhg-density";

export function getDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  return (localStorage.getItem(KEY) as Density) || "comfortable";
}

export function applyDensity(d: Density) {
  localStorage.setItem(KEY, d);
  document.documentElement.setAttribute("data-density", d);
}
