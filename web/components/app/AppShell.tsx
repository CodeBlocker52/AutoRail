"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Droplets } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { Badge } from "@/components/ui/Badge";
import { Amount } from "@/components/ui/Amount";
import { NetworkGuard } from "@/components/autorail/NetworkGuard";
import { ROLES, useActor, useRole } from "@/hooks/useRole";
import { useBalances } from "@/hooks/useBalances";
import { useClient } from "@/hooks/useClient";
import { SITE } from "@/lib/config/contracts";
import { cn } from "@/lib/cn";
import { APP_NAV, pageTitle } from "./nav";
import { RoleSwitcher } from "./RoleSwitcher";
import { ActingAs } from "./ActingAs";
import { TestnetBanner } from "./TestnetBanner";

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(href + "/") || (href === "/app/vendor" && pathname.startsWith("/app/invoices"));
}

function SidebarFooter() {
  const actor = useActor();
  const { role } = useRole();
  const { data: bal } = useBalances(actor);
  return (
    <div className="rounded-card border border-line bg-bg p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden />
        <span className="text-[13px] font-medium text-ink">Aevum Testnet · 44005</span>
      </div>
      <dl className="mt-3 space-y-1.5 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-muted">tUSD8</dt>
          <dd><Amount value={bal?.tUSD8} symbol={false} className="text-ink" /></dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">tQDAY</dt>
          <dd><Amount value={bal?.tQDAY} decimals={18} maxFrac={3} symbol={false} className="text-ink" /></dd>
        </div>
      </dl>
      <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">Acting as {role}</p>
      <a href={SITE.faucetUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline">
        <Droplets className="h-3.5 w-3.5" aria-hidden /> Faucet
      </a>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const client = useClient();
  const { role, setRole } = useRole();
  // Keep the acting role in sync when navigating straight to a role's screen.
  useEffect(() => {
    const match = ROLES.find((r) => pathname === r.href || pathname.startsWith(r.href + "/"));
    if (match && match.id !== role) setRole(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  return (
    <div className="min-h-screen bg-bg">
      <a href="#app-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Sidebar (≥ lg) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col overflow-y-auto border-r border-line bg-surface px-4 pb-20 pt-5 lg:flex">
        <Link href="/" className="px-2" aria-label="Autorail home">
          <Logo size={28} />
        </Link>
        <nav aria-label="App" className="mt-8 flex-1">
          <ul className="space-y-1">
            {APP_NAV.map((n) => {
              const on = isActive(pathname, n.href);
              return (
                <li key={n.href}>
                  <Link href={n.href} aria-current={on ? "page" : undefined} className={cn("flex h-10 items-center gap-3 rounded-btn px-3 text-[14.5px] font-medium transition-colors", on ? "bg-brand-soft text-brand" : "text-text hover:bg-ink/5")}>
                    <n.icon className="h-[18px] w-[18px]" aria-hidden />
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <SidebarFooter />
      </aside>

      <div className="lg:pl-[248px]">
        <div className="relative">
          <TestnetBanner />
        </div>
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Link href="/" className="lg:hidden" aria-label="Autorail home">
              <Logo size={28} wordmark={false} />
            </Link>
            <h1 className="min-w-0 flex-1 truncate font-serif text-[22px] font-bold text-ink sm:text-[26px]">{pageTitle(pathname)}</h1>
            {client.mode === "mock" && <Badge tone="warning" className="hidden xl:inline-flex">Mock data</Badge>}
            <RoleSwitcher />
            {client.mode === "mock" && <ActingAs className="hidden min-w-0 md:block" />}
            <ConnectButton chainStatus="icon" accountStatus={{ smallScreen: "avatar", largeScreen: "address" }} showBalance={false} label="Connect" />
          </div>
        </header>

        <main id="app-main" className="mx-auto max-w-[1320px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-16 lg:pt-8">
          {client.mode === "mock" && <ActingAs className="mb-4 md:hidden" />}
          <NetworkGuard />
          {children}
        </main>
      </div>

      {/* Bottom tab bar (< lg) */}
      <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="grid grid-cols-6">
          {APP_NAV.map((n) => {
            const on = isActive(pathname, n.href);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={on ? "page" : undefined} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium", on ? "text-brand" : "text-muted")}>
                  <n.icon className="h-5 w-5" aria-hidden />
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
