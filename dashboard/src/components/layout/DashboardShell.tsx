"use client";

import { Sidebar } from "./Sidebar";
import { MobileSidebar } from "./MobileSidebar";
import { Header } from "./Header";

export function DashboardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">
      <Sidebar />
      <MobileSidebar />
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={title} subtitle={subtitle} />
        <main className="dashboard-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
