"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { OS_NAVIGATION, isActivePath } from "@/constants/navigation";
import { useSidebar } from "@/hooks/useSidebar";
import { useNotifications } from "@/hooks/useNotifications";
import { BrandMark } from "./Sidebar";
import { cn } from "@/lib/utils";

export function MobileSidebar() {
  const { mobileOpen, setMobileOpen } = useSidebar();
  const { unreadCount, pendingApprovalsCount } = useNotifications();
  const pathname = usePathname() ?? "/overview";

  if (!mobileOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />
      <aside className="relative z-10 flex h-full w-72 flex-col bg-brand-ink text-neutral-200">
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <BrandMark />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="rounded-md p-1 text-neutral-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="sidebar-nav flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {OS_NAVIGATION.map((group) => (
            <div key={group.group}>
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                {group.group}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);
                  const isNotif = item.href === "/notifications";
                  const isDeploy = item.href === "/deployments";
                  const showNotifBadge = isNotif && unreadCount > 0;
                  const showDeployBadge = isDeploy && pendingApprovalsCount > 0;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium",
                          active
                            ? "bg-brand text-brand-ink font-semibold"
                            : "text-neutral-300 hover:bg-white/10"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                        {showNotifBadge && (
                          <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-sm">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                        {showDeployBadge && (
                          <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black shadow-sm">
                            {pendingApprovalsCount}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </div>
  );
}
