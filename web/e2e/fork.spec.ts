import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";

/** Role keys come from contracts/.env (fork only; never printed, never bundled). */
function key(name: string): string {
  const env = readFileSync(join(__dirname, "../../contracts/.env"), "utf8");
  const v = env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();
  if (!v) throw new Error(`${name} missing in contracts/.env`);
  return v.startsWith("0x") ? v : `0x${v}`;
}

const SHOTS = process.env.E2E_SHOTS_DIR;

async function as(browser: Browser, keyName: string): Promise<Page> {
  const ctx = await browser.newContext();
  await ctx.addInitScript((k) => ((window as unknown as { __AUTORAIL_TEST_KEY__: string }).__AUTORAIL_TEST_KEY__ = k), key(keyName));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message.slice(0, 300)}`));
  page.on("console", (m) => m.type() === "error" && console.log(`[console] ${m.text().slice(0, 300)}`));
  return page;
}

async function open(p: Page, path: string) {
  await p.goto(path, { waitUntil: "networkidle" });
  // connected via the fork-only test connector
  await expect(p.getByText(/tUSD8/).first()).toBeVisible();
  await p.waitForTimeout(1500);
}

test.describe.serial("fork: full invoice cycle through the UI", () => {
  let receivableUrl = "";

  test("lender deposits with a permit", async ({ browser }) => {
    const p = await as(browser, "LENDER_PRIVATE_KEY");
    await open(p, "/app/lend");
    const card = p.locator(".card", { hasText: "Your position" });
    const value = async () => Number((await card.innerText()).match(/Value\s+([\d.,]+)/)?.[1]?.replace(/,/g, "") ?? NaN);
    await expect.poll(value).not.toBeNaN();
    const before = await value();
    await p.getByLabel("Amount").first().fill("0.5");
    await p.getByRole("button", { name: "Deposit with permit" }).click();
    // position card updates from the chain once the deposit is mined
    await expect.poll(value, { timeout: 60_000 }).toBeCloseTo(before + 0.5, 2);
    await p.waitForTimeout(1000);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/lend-deposit.png` });
  });

  test("vendor creates an invoice", async ({ browser }) => {
    const p = await as(browser, "SELLER_PRIVATE_KEY");
    await open(p, "/app/vendor");
    await p.getByLabel("Amount").fill("0.2");
    await p.getByRole("button", { name: "Create invoice" }).click();
    const link = p.getByRole("link", { name: /Open invoice/ });
    await expect(link).toBeVisible({ timeout: 60_000 });
    receivableUrl = (await link.getAttribute("href"))!;
    expect(receivableUrl).toMatch(/\/app\/invoices\/0x[0-9a-f]{64}$/);
  });

  test("lab reviews and confirms (EIP-712)", async ({ browser }) => {
    const p = await as(browser, "BUYER_PRIVATE_KEY");
    await open(p, "/app/lab");
    await p.getByRole("button", { name: "Review and confirm" }).first().click();
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/lab-confirm-review.png` });
    await p.getByRole("dialog").getByRole("button", { name: "Sign confirmation" }).click();
    await expect(p.getByRole("dialog").getByRole("button", { name: "Done" })).toBeVisible({ timeout: 60_000 });
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/lab-confirmed.png` });
  });

  test("vendor accepts the underwriter's offer", async ({ browser }) => {
    const p = await as(browser, "SELLER_PRIVATE_KEY");
    await open(p, receivableUrl);
    await expect(p.getByText(/Band [ABCD]/).first()).toBeVisible({ timeout: 60_000 });
    await p.getByRole("button", { name: /Accept/i }).first().click();
    await expect(p.getByRole("button", { name: /Accept/i })).toHaveCount(0, { timeout: 60_000 });
    await expect(p.getByText(/JobWallet/).first()).toBeVisible({ timeout: 60_000 });
  });

  test("lab pays gasless (EIP-3009 → relayer)", async ({ browser }) => {
    const p = await as(browser, "BUYER_PRIVATE_KEY");
    await open(p, "/app/lab");
    await p.getByRole("button", { name: "Pay invoice" }).first().click();
    await p.getByRole("dialog").getByRole("button", { name: /Sign and pay/ }).click();
    await expect(p.getByRole("dialog").getByRole("button", { name: "Done" })).toBeVisible({ timeout: 90_000 });
    await p.waitForTimeout(800);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/lab-gasless-pay.png` });
  });

  test("invoice is Repaid and the audit trail shows it", async ({ browser }) => {
    const p = await as(browser, "BUYER_PRIVATE_KEY");
    await open(p, receivableUrl);
    await expect(p.getByText("Repaid", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    await expect(p.getByText(/paid: 0\.20 tUSD8 \(on time\)/).first()).toBeVisible({ timeout: 60_000 });
  });
});
