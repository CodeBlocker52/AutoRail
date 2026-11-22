import { test, expect } from "@playwright/test";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DEPLOYMENTS } from "../lib/autorail/generated/deployments";
import { autorailRolesAbi } from "../lib/autorail/generated/abis";

/**
 * A judge with a brand-new wallet (0 tQDAY, 0 tUSD8) onboards as a vendor through the UI on the local fork:
 * gas drip → register ERC-8004 agent → sign → Seller role → invoice to Frontier Lab is auto-confirmed.
 * Needs the fork's AutorailRoles owned by ROLES_OPERATOR and the DRIP wallet funded (see web/docs/UI.md).
 */
const pc = createPublicClient({ transport: http("http://127.0.0.1:8555") });
const roles = (DEPLOYMENTS as unknown as Record<number, { contracts: Record<string, Address> }>)[440050].contracts.roles;
const SHOTS = process.env.E2E_SHOTS_DIR;

test("fresh wallet: drip → register agent → Seller role → auto-confirmed invoice", async ({ browser }) => {
  const pk = generatePrivateKey() as Hex;
  const addr = privateKeyToAccount(pk).address;
  const ctx = await browser.newContext();
  // one simulated client IP per run (TEST-NET-3) so per-IP limits start fresh; Vercel overwrites this header in production
  const ip = `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
  await ctx.route("**/api/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-forwarded-for": ip } }));
  await ctx.addInitScript((k) => {
    (window as unknown as Record<string, unknown>).__AUTORAIL_TEST_KEY__ = k;
    window.localStorage.setItem("autorail:mode", "onchain");
  }, pk);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(`[pageerror] ${e.message.slice(0, 200)}`));

  await p.goto("/app/onboard?role=vendor", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Get 0.02 tQDAY" }).click();
  await expect(p.getByText(/Sent 0\.02 tQDAY for gas/)).toBeVisible({ timeout: 60_000 });
  expect(await pc.getBalance({ address: addr })).toBe(20_000_000_000_000_000n);

  await p.getByLabel("Agent name").fill("Judge Vendor (e2e)");
  await p.getByRole("button", { name: "Register agent" }).click();
  await expect(p.getByText(/Agent #\d+ registered/)).toBeVisible({ timeout: 60_000 });
  await p.getByRole("button", { name: "Sign and get my role" }).click();
  await expect(p.getByText("Role assigned.")).toBeVisible({ timeout: 60_000 });
  const [ok] = (await pc.readContract({ address: roles, abi: autorailRolesAbi, functionName: "isAgent", args: [addr, 1] })) as [boolean, bigint];
  expect(ok).toBe(true);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/onboard-done.png`, fullPage: true });

  await p.getByRole("link", { name: /Go to the Vendor screen/ }).click();
  await p.waitForURL(/\/app\/vendor/);
  await expect(p.getByText(/isn't a vendor yet/)).toHaveCount(0);
  await p.getByLabel("Amount").fill("0.05");
  await p.getByRole("button", { name: "Create invoice" }).click();
  await expect(p.getByText(/Frontier Lab confirmed it/)).toBeVisible({ timeout: 90_000 });
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/onboard-autoconfirmed.png` });
});
