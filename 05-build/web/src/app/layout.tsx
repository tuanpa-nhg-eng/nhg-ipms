import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SidebarProvider } from "@/components/providers/SidebarProvider";
import { LangProvider } from "@/lib/i18n";
import { CopilotMount } from "@/components/copilot/CopilotMount";

export const metadata: Metadata = {
  title: "NHG iPMS — Performance & Growth Operating System",
  description: "Intelligent Performance Management System của Tập đoàn Nguyễn Hoàng",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/icon-logo.png" />
      </head>
      <body>
        <ThemeProvider>
          <LangProvider>
            <SidebarProvider>{children}</SidebarProvider>
            <CopilotMount />
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
