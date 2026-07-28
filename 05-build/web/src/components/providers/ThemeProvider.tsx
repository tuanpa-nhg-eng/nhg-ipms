"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark";
const Ctx = createContext<{ theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }>({
  theme: "light", toggle: () => {}, setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    const saved = (localStorage.getItem("nhg-theme") as Theme) || "light";
    setThemeState(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);
  const apply = (n: Theme) => {
    localStorage.setItem("nhg-theme", n);
    document.documentElement.setAttribute("data-theme", n);
    setThemeState(n);
  };
  const toggle = () => apply(theme === "light" ? "dark" : "light");
  // [Trục B L5] Đặt trực tiếp giá trị — Settings/Tuỳ chọn cần chọn light/dark tường minh,
  // không chỉ đảo ngược như nút toggle nhanh ở Topbar.
  return <Ctx.Provider value={{ theme, toggle, setTheme: apply }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
