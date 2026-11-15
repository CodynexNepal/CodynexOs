"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { AutonomousComputerConsole } from "@/components/domain/AutonomousComputerConsole";

export default function WorkspacePage() {
  return (
    <DashboardShell
      title="Autonomous AI Computer Workspace"
      subtitle="Direct access to live Playwright browser automation, interactive terminal shell, and real-time code streaming"
    >
      <AutonomousComputerConsole />
    </DashboardShell>
  );
}
