"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { OS_NAVIGATION, isActivePath } from "@/constants/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useSidebar } from "@/hooks/useSidebar";
import { useNotifications } from "@/hooks/useNotifications";
import { CodyNexLogoMark } from "@/components/ui/CodyNexLogo";
import { cn, initials } from "@/lib/utils";

export function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 overflow-hidden">
      <CodyNexLogoMark className="h-8 w-8" />
      {!collapsed && (
        <span className="whitespace-nowrap">
          <span className="block text-[15px] font-bold leading-tight text-white">CodyNex OS</span>
          <span className="block text-[11px] font-medium text-neutral-400">Company Runtime</span>
        </span>
      )}
    </span>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const { collapsed, setCollapsed } = useSidebar();
  const { unreadCount, pendingApprovalsCount } = useNotifications();
  const pathname = usePathname() ?? "/overview";

  return (
    <aside
      aria-label="Primary Navigation"
      className={cn(
        "hidden h-full shrink-0 flex-col bg-brand-ink text-neutral-200 transition-[width] duration-200 lg:flex",
        collapsed ? "w-[74px]" : "w-[258px]"
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-3.5">
        <Link href="/overview" className="min-w-0">
          <BrandMark collapsed={collapsed} />
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-md p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="sidebar-nav min-h-0 flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
        {OS_NAVIGATION.map((group) => (
          <div key={group.group}>
            {!collapsed && (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                {group.group}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = item.icon;
                const isNotif = item.href === "/notifications";
                const isDeploy = item.href === "/deployments";
                const showNotifBadge = isNotif && unreadCount > 0;
                const showDeployBadge = isDeploy && pendingApprovalsCount > 0;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-brand text-brand-ink font-semibold"
                          : "text-neutral-300 hover:bg-white/10 hover:text-white",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      <span className="relative">
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        {collapsed && showNotifBadge && (
                          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-600 ring-2 ring-brand-ink" />
                        )}
                        {collapsed && showDeployBadge && (
                          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-brand-ink" />
                        )}
                      </span>
                      {!collapsed && (
                        <>
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
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-ink">
            {initials(user?.fullName)}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">
                {user?.fullName ?? "CEO"}
              </p>
              <p className="truncate text-[11px] text-neutral-400">{user?.role ?? "CEO"}</p>
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-md p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
