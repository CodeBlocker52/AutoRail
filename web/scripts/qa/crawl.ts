/**
 * Read-only UI crawl (Live mode): every route at 375 / 768 / 1440 px.
 * Fails on: console errors, page errors, failed requests (402 from the x402 merchant is expected), broken internal
 * links or #anchors, horizontal overflow, explorer links that aren't real Aevum (44005) transactions, a proof strip
 * that doesn't point at a real Repaid. Then Lighthouse on / and /app.
 *
 *   BASE=https://autorail-qday.vercel.app pnpm qa:crawl     (default BASE: http://localhost:3313)
 *   NO_LIGHTHOUSE=1 to skip Lighthouse.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { createPublicClient, decodeEventLog, http, type Abi, type Hash } from "viem";
import { repaymentRouterAbi } from "../../lib/autorail/generated/abis";
import { DEPLOYMENTS } from "../../lib/autorail/generated/deployments";
import { aevumTestnet } from "../../lib/chain/aevum";

const BASE = (process.env.BASE ?? "http://localhost:3313").replace(/\/$/, "");
const DATE = new Date().toISOString().slice(0, 10);
const ROOT = join(__dirname, "../../..");
const SHOTS = process.env.SHOTS_DIR;
const RECORDED = "0x345bd6f6c2da03cd2135e4821832026dd776bee228f0d001e6a1e0da2e557281";
const ROUTES = ["/", "/app", "/app/lend", "/app/vendor", "/app/lab", "/app/agents", "/app/audit", "/app/onboard", `/app/invoices/${RECORDED}`, "/design"];
const WIDTHS = [375, 768, 1440];
const EXPLORER = "https://explorer-test.qday.info";
const pc = createPublicClient({ chain: aevumTestnet, transport: http() });

type Issue = { route: string; width: number; kind: string; detail: string };
const issues: Issue[] = [];
const notes: string[] = [];
const explorerLinks = new Set<string>();
const internalLinks = new Set<string>();
const externalLinks = new Set<string>();

async function visit(page: Page, route: string, width: number) {
  const errs: string[] = [];
  const onConsole = (m: { type: () => string; text: () => string }) => m.type() === "error" && errs.push(m.text().slice(0, 240));
  const onPageError = (e: Error) => errs.push(`pageerror: ${e.message.slice(0, 240)}`);
  const onFailed = (r: { url: () => string; failure: () => { errorText: string } | null }) => {
    const f = r.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(f)) return; // navigation / cancelled polling
    issues.push({ route, width, kind: "request-failed", detail: `${r.url().slice(0, 140)} ${f}` });
  };
  const onResponse = (r: { url: () => string; status: () => number }) => {
    const s = r.status();
    if (s >= 400 && s !== 402 && !r.url().includes("/_vercel/")) issues.push({ route, width, kind: `http-${s}`, detail: r.url().slice(0, 160) });
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onFailed);
  page.on("response", onResponse);
  try {
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(route === "/" ? 4_000 : 7_000); // let polling data and the indexer land
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) issues.push({ route, width, kind: "horizontal-overflow", detail: `${overflow}px wider than the viewport` });
    const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    for (const href of links) {
      if (href.startsWith("#")) {
        const ok = await page.evaluate((id) => !!document.getElementById(id) || id === "", href.slice(1));
        if (!ok) issues.push({ route, width, kind: "broken-anchor", detail: href });
      } else if (href.startsWith("/")) internalLinks.add(href.split("#")[0]);
      else if (href.startsWith(EXPLORER)) explorerLinks.add(href);
      else if (/^https?:/.test(href)) externalLinks.add(href);
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${route.replace(/\W+/g, "_") || "root"}-${width}.png` });
  } catch (e) {
    issues.push({ route, width, kind: "navigation", detail: String((e as Error).message).slice(0, 200) });
  }
  for (const e of errs) issues.push({ route, width, kind: "console-error", detail: e });
  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("requestfailed", onFailed);
  page.off("response", onResponse);
}

async function main() {
  console.log(`crawl ${BASE}`);
  const browser = await chromium.launch({ channel: "chrome" });
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 812 : 1000 }, isMobile: width < 500, hasTouch: width < 500 });
    await ctx.addInitScript(() => window.localStorage.setItem("autorail:mode", "onchain"));
    const page = await ctx.newPage();
    for (const r of ROUTES) {
      await visit(page, r, width);
      process.stdout.write(".");
    }
    await ctx.close();
  }
  console.log("");

  // proof strip → a real Repaid on Aevum
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    const strip = page.getByText("Latest settlement", { exact: false }).first();
    await strip.waitFor({ timeout: 30_000 }).catch(() => undefined);
    const href = await page.locator(`a[href^="${EXPLORER}/tx/"]`).first().getAttribute("href").catch(() => null);
    const demoTag = await page.getByText("demo data", { exact: true }).count();
    let ok = false;
    if (href) {
      const hash = href.split("/tx/")[1] as Hash;
      const rc = await pc.getTransactionReceipt({ hash }).catch(() => null);
      ok = !!rc && rc.logs.some((l) => {
        try {
          const ev = decodeEventLog({ abi: repaymentRouterAbi as unknown as Abi, data: l.data, topics: l.topics });
          return ev.eventName === "Repaid" && l.address.toLowerCase() === DEPLOYMENTS[44005].contracts.router.toLowerCase();
        } catch {
          return false;
        }
      });
    }
    if (!ok) issues.push({ route: "/", width: 1440, kind: "proof-strip", detail: href ? `${href} is not a router Repaid tx` : demoTag ? "proof strip shows demo data (site is in mock mode)" : "no proof strip tx link" });
    else notes.push(`proof strip → ${href} (router Repaid verified onchain)`);
    await ctx.close();
  }
  await browser.close();

  // internal links resolve
  for (const href of internalLinks) {
    const res = await fetch(BASE + href, { redirect: "follow" }).catch(() => null);
    if (!res || res.status >= 400) issues.push({ route: href, width: 0, kind: "broken-link", detail: `${res?.status ?? "fetch failed"}` });
  }
  // explorer links: right shape and known to Aevum's explorer (sample)
  const sample = [...explorerLinks].filter((h) => /\/tx\//.test(h)).slice(0, 8);
  for (const h of explorerLinks) if (!/^https:\/\/explorer-test\.qday\.info(\/?|\/(tx\/0x[0-9a-fA-F]{64}|address\/0x[0-9a-fA-F]{40}|block\/\d+))$/.test(h)) issues.push({ route: "-", width: 0, kind: "explorer-link-shape", detail: h });
  for (const h of sample) {
    const hash = h.split("/tx/")[1];
    const j = (await (await fetch(`${EXPLORER}/api?module=transaction&action=gettxinfo&txhash=${hash}`)).json().catch(() => ({}))) as { status?: string };
    if (j.status !== "1") issues.push({ route: "-", width: 0, kind: "explorer-link-unknown", detail: h });
  }
  notes.push(`${internalLinks.size} internal links, ${explorerLinks.size} explorer links (${sample.length} verified on Blockscout), ${externalLinks.size} external links`);

  // Lighthouse (mobile, default config)
  const lighthouse: Record<string, Record<string, number>> = {};
  if (!process.env.NO_LIGHTHOUSE) {
    for (const r of ["/", "/app"]) {
      const out = join(process.env.TMPDIR ?? "/tmp", `lh-${r.replace(/\W/g, "_")}.json`);
      try {
        execFileSync("npx", ["-y", "lighthouse@12", BASE + r, "--quiet", "--chrome-flags=--headless=new", "--output=json", `--output-path=${out}`, "--only-categories=performance,accessibility,best-practices,seo"], {
          stdio: "ignore",
          env: { ...process.env, CHROME_PATH: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
          timeout: 240_000,
        });
        const d = JSON.parse(readFileSync(out, "utf8")) as { categories: Record<string, { score: number }> };
        lighthouse[r] = Object.fromEntries(Object.entries(d.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
      } catch (e) {
        notes.push(`lighthouse ${r} failed: ${String((e as Error).message).slice(0, 80)}`);
      }
    }
  }

  const target = new URL(BASE).host.replace(/[:.]/g, "-");
  mkdirSync(join(ROOT, "docs/qa"), { recursive: true });
  const file = join(ROOT, `docs/qa/crawl-${target}-${DATE}.json`);
  writeFileSync(file, JSON.stringify({ base: BASE, date: new Date().toISOString(), routes: ROUTES, widths: WIDTHS, issues, notes, lighthouse }, null, 2));
  const byKind = issues.reduce<Record<string, number>>((m, i) => ((m[i.kind] = (m[i.kind] ?? 0) + 1), m), {});
  console.log(`issues: ${issues.length} ${JSON.stringify(byKind)}`);
  for (const i of issues.slice(0, 25)) console.log(`  [${i.kind}] ${i.route} @${i.width}: ${i.detail}`);
  for (const n of notes) console.log(`  · ${n}`);
  console.log(`lighthouse: ${JSON.stringify(lighthouse)}`);
  console.log(`→ ${file}`);
  process.exit(issues.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
