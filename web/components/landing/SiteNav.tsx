"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { SITE } from "@/lib/config/contracts";
import { cn } from "@/lib/cn";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#problem", label: "Vendors" },
  { href: "#lenders", label: "Lenders" },
  { href: "#safety", label: "Safety" },
  { href: SITE.docsUrl, label: "Docs", external: true },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cn("sticky top-0 z-50 border-b transition-colors duration-300", scrolled || open ? "border-line bg-bg/80 backdrop-blur-md" : "border-transparent bg-bg/0")}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <nav aria-label="Main" className="mx-auto flex h-[72px] max-w-page items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Autorail home" className="rounded">
          <Logo size={30} />
        </Link>
        <ul className="hidden items-center gap-8 lg:flex">
          {links.map((l) => (
            <li key={l.label}>
              <a href={l.href} className="nav-link" {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4">
          <a href={SITE.githubUrl} target="_blank" rel="noreferrer" className="hidden items-center gap-1 text-[14px] font-medium text-text hover:text-brand sm:inline-flex">
            GitHub <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
          <ButtonLink href="/app" size="sm" className="h-10 px-4">
            Open App
          </ButtonLink>
          <button className="grid h-10 w-10 place-items-center rounded-btn border border-line lg:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      {open && (
        <div id="mobile-nav" className="border-t border-line bg-bg px-5 pb-6 pt-2 lg:hidden">
          <ul className="flex flex-col">
            {[...links, { href: SITE.githubUrl, label: "GitHub", external: true }].map((l) => (
              <li key={l.label}>
                <a href={l.href} onClick={() => setOpen(false)} className="nav-link block border-b border-line py-4" {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
