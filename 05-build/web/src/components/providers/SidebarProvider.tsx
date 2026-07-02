"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

const Ctx = createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("nhg-sidebar-collapsed") === "1") setCollapsed(true);
  }, []);
  const toggle = () =>
    setCollapsed((p) => {
      const n = !p;
      localStorage.setItem("nhg-sidebar-collapsed", n ? "1" : "0");
      return n;
    });
  return <Ctx.Provider value={{ collapsed, toggle }}>{children}</Ctx.Provider>;
}

export const useSidebar = () => useContext(Ctx);
