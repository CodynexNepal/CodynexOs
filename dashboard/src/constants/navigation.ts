import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Brain,
  Building2,
  CheckSquare,
  Coins,
  FolderKanban,
  GitBranch,
  GitPullRequest,
  LayoutDashboard,
  Megaphone,
  Rocket,
  ScrollText,
  Settings,
  ShieldCheck,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavChild {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  group: string;
  items: NavChild[];
}

export const OS_NAVIGATION: NavGroup[] = [
  {
    group: "Executive",
    items: [
      { label: "Overview", href: "/overview", icon: LayoutDashboard },
      { label: "AI Command Center", href: "/command", icon: Terminal },
      { label: "Notifications", href: "/notifications", icon: Bell },
    ],
  },
  {
    group: "Organization",
    items: [
      { label: "AI Employees", href: "/employees", icon: Bot },
      { label: "Departments", href: "/departments", icon: Building2 },
      { label: "Projects", href: "/projects", icon: FolderKanban },
      { label: "Tasks", href: "/tasks", icon: CheckSquare },
    ],
  },
  {
    group: "Knowledge",
    items: [
      { label: "Company Memory", href: "/memory", icon: Brain },
      { label: "Knowledge Base", href: "/knowledge", icon: BookOpen },
    ],
  },
  {
    group: "Engineering & QA",
    items: [
      { label: "GitHub Integration", href: "/github", icon: GitBranch },
      { label: "Code Review", href: "/code-review", icon: GitPullRequest },
      { label: "Testing Center", href: "/testing", icon: ShieldCheck },
      { label: "Approvals & Deploy", href: "/deployments", icon: Rocket },
    ],
  },
  {
    group: "Growth & Revenue",
    items: [
      { label: "Marketing", href: "/marketing", icon: Megaphone },
      { label: "Sales CRM", href: "/crm", icon: Users },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    group: "Governance",
    items: [
      { label: "AI Usage & Cost", href: "/ai-usage", icon: Coins },
      { label: "Audit Logs", href: "/audit-logs", icon: ScrollText },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS = OS_NAVIGATION.flatMap((g) => g.items);

export function isActivePath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function routeTitle(pathname: string): string {
  const match = ALL_NAV_ITEMS.find((item) => isActivePath(pathname, item.href));
  return match?.label ?? "CodyNex OS";
}

export { Activity };
