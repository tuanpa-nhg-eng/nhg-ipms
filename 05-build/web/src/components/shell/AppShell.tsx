"use client";
import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useSidebar } from "@/components/providers/SidebarProvider";

export function AppShell({
  children,
  crumb,
}: {
  children: ReactNode;
  crumb: { section: string; page: string };
}) {
  const { collapsed } = useSidebar();
  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <Sidebar />
      <div>
        <Topbar crumb={crumb} />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
