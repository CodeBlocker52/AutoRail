import { Bot, FileText, Landmark, LayoutDashboard, ScrollText, Stamp } from "lucide-react";

export const APP_NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/lend", label: "Lend", icon: Landmark },
  { href: "/app/vendor", label: "Vendor", icon: FileText },
  { href: "/app/lab", label: "Lab", icon: Stamp },
  { href: "/app/agents", label: "Agents", icon: Bot },
  { href: "/app/audit", label: "Audit", icon: ScrollText },
] as const;

export function pageTitle(pathname: string): string {
  if (pathname.startsWith("/app/invoices/")) return "Invoice";
  const hit = [...APP_NAV].reverse().find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  return hit?.label ?? "Overview";
}
