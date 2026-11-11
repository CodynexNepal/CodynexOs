"use client";

import Link from "next/link";
import { Menu, Moon, Sun, Terminal } from "lucide-react";
import { useSidebar } from "@/hooks/useSidebar";
import { useTheme } from "@/hooks/useTheme";

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const { setMobileOpen } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-surface-border bg-surface px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-md border border-surface-border p-2 text-ink lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-ink sm:text-lg">{title}</h1>
          {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href="/command"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-brand-ink transition-colors hover:bg-brand-dark"
        >
          <Terminal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Issue Command</span>
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-surface-border bg-surface text-ink hover:border-ink"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
