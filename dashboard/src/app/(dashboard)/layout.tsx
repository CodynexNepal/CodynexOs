"use client";

import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
