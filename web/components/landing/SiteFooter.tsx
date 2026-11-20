import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { SITE } from "@/lib/config/contracts";

const links = [
  { label: "App", href: "/app" },
  { label: "Docs", href: SITE.docsUrl, external: true },
  { label: "GitHub", href: SITE.githubUrl, external: true },
  { label: "Explorer", href: SITE.explorerUrl, external: true },
  { label: "Faucet", href: SITE.faucetUrl, external: true },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto grid max-w-page gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.2fr_1fr]">
        <div>
          <Logo size={30} />
          <p className="mt-4 max-w-sm text-[15px] text-muted">Working capital for the vendors who train frontier AI. Built for the QDay Aevum Builder Challenge #1.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-8 gap-y-3 md:justify-end">
            {links.map((l) => (
              <li key={l.label}>
                {l.external ? (
                  <a href={l.href} target="_blank" rel="noreferrer" className="nav-link">
                    {l.label}
                  </a>
                ) : (
                  <Link href={l.href} className="nav-link">
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-page flex-col gap-2 px-5 py-6 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            <em>Testnet only. tUSD8 and tQDAY are test assets with no monetary value. Contracts are unaudited.</em>
          </p>
          <p className="font-mono text-[12px]">MIT · Chain 44005</p>
        </div>
      </div>
    </footer>
  );
}
