"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FrontendPreviewRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/workspace");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-surface-muted text-ink-muted">
      <p className="text-sm">Redirecting to Autonomous Workspace...</p>
    </div>
  );
}
