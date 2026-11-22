import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { createPublicClient, http, parseAbiItem, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DEPLOYMENTS } from "../lib/autorail/generated/deployments";

/**
 * Failure drills on the local fork (chain 440050) with the fork-only test wallet:
 * double-submit, wrong network, insufficient tUSD8 / tQDAY, rejected signature, pending tx across navigation.
 */
const FORK = "http://127.0.0.1:8555";
const pc = createPublicClient({ transport: http(FORK) });
const D = (DEPLOYMENTS as unknown as Record<number, { contracts: Record<string, Address>; tUSD8: Address }>)[440050];
const SHOTS = process.env.E2E_SHOTS_DIR;

function key(name: string): Hex {
  const env = readFileSync(join(__dirname, "../../contracts/.env"), "utf8");
  const v = env.match(new RegExp(`^${name}=(.*)$`, "m"))![1].trim();
  return (v.startsWith("0x") ? v : `0x${v}`) as Hex;
}
const rpc = (method: string, params: unknown[]) => execFileSync("cast", ["rpc", method, ...params.map(String), "--rpc-url", FORK], { env: { ...process.env, PATH: `${process.env.HOME}/.foundry/bin:${process.env.PATH}` } });
const deal = (to: Address, amount: number) =>
  execFileSync("make", ["-s", "deal", `TO=${to}`, `AMOUNT=${amount}`], { cwd: join(__dirname, "../../contracts"), env: { ...process.env, PATH: `${process.env.HOME}/.foundry/bin:${process.env.PATH}` } });

async function as(browser: Browser, pk: Hex, opts: { reject?: boolean; chainId?: number } = {}): Promise<Page> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ({ k, reject, chainId }) => {
      const w = window as unknown as Record<string, unknown>;
      w.__AUTORAIL_TEST_KEY__ = k;
      if (reject) w.__AUTORAIL_TEST_REJECT__ = true;
      if (chainId) w.__AUTORAIL_TEST_CHAIN_ID__ = chainId;
      window.localStorage.setItem("autorail:mode", "onchain");
    },
    { k: pk, reject: !!opts.reject, chainId: opts.chainId ?? 0 },
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message.slice(0, 200)}`));
  return page;
}
const prompts = (p: Page) => p.evaluate(() => (window as unknown as { __AUTORAIL_TEST_PROMPTS__?: number }).__AUTORAIL_TEST_PROMPTS__ ?? 0);
async function openLend(p: Page) {
  await p.goto("/app/lend", { waitUntil: "networkidle" });
  await expect(p.getByText(/Balance [\d.,]+ tUSD8/).first()).toBeVisible({ timeout: 60_000 });
}
const deposits = async (owner: Address, from: bigint) => {
  if (from > (await pc.getBlockNumber())) return 0;
  return (await pc.getLogs({ address: D.contracts.vault, event: parseAbiItem("event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)"), args: { owner }, fromBlock: from })).length;
};

test.describe.serial("failure drills (fork)", () => {
  test("double-click on Deposit → one permit, one transaction", async ({ browser }) => {
    const pk = key("LENDER_PRIVATE_KEY");
    const owner = privateKeyToAccount(pk).address;
    const from = (await pc.getBlockNumber()) + 1n; // the head block may hold an earlier tx
    const p = await as(browser, pk);
    await openLend(p);
    await p.getByLabel("Amount").first().fill("0.1");
    await p.getByRole("button", { name: "Deposit with permit" }).dblclick();
    await p.getByRole("button", { name: "Deposit with permit" }).click({ force: true }).catch(() => undefined);
    await expect(p.locator(".card", { hasText: "Deposit" }).first().getByText("Confirmed")).toBeVisible({ timeout: 60_000 });
    await p.waitForTimeout(2_000);
    expect(await deposits(owner, from)).toBe(1);
    expect(await prompts(p)).toBe(2); // one permit signature + one transaction
  });

  test("double-click on Create invoice → one ReceivableCreated", async ({ browser }) => {
    const pk = key("SELLER_PRIVATE_KEY");
    const from = (await pc.getBlockNumber()) + 1n; // the head block may hold an earlier tx
    const p = await as(browser, pk);
    await p.goto("/app/vendor", { waitUntil: "networkidle" });
    await p.getByLabel("Amount").fill("0.05");
    await p.getByRole("button", { name: "Create invoice" }).dblclick();
    await expect(p.getByRole("link", { name: /Open invoice/ })).toBeVisible({ timeout: 60_000 });
    const created = await pc.getLogs({
      address: D.contracts.registry,
      event: parseAbiItem("event ReceivableCreated(bytes32 indexed id, uint256 indexed sellerAgentId, uint256 indexed buyerAgentId, address seller, bytes32 invoiceHash, uint256 amount, uint64 dueDate)"),
      fromBlock: from,
    });
    expect(created.length).toBe(1);
    expect(await prompts(p)).toBe(1);
  });

  test("wrong network → switch prompt, writes refused before any prompt", async ({ browser }) => {
    const p = await as(browser, key("LENDER_PRIVATE_KEY"), { chainId: 1 });
    await p.goto("/app/lend", { waitUntil: "networkidle" });
    await expect(p.getByRole("button", { name: "Switch network" })).toBeVisible({ timeout: 30_000 });
    await expect(p.getByText(/Writes are refused until you switch/)).toBeVisible();
    await p.getByLabel("Amount").first().fill("0.1");
    await p.getByRole("button", { name: "Deposit with permit" }).click();
    await expect(p.getByText(/Switch your wallet to QDay Aevum testnet/).first()).toBeVisible({ timeout: 30_000 });
    expect(await prompts(p)).toBe(0);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/drill-wrong-network.png` });
  });

  test("insufficient tUSD8 → plain-English message, button disabled, no prompt", async ({ browser }) => {
    const pk = generatePrivateKey();
    rpc("anvil_setBalance", [privateKeyToAccount(pk).address, "0x2386F26FC10000"]); // 0.01 tQDAY, 0 tUSD8
    const p = await as(browser, pk);
    await openLend(p);
    await p.getByLabel("Amount").first().fill("0.1");
    await expect(p.getByText(/Above the available 0\.00 tUSD8/)).toBeVisible();
    await expect(p.getByRole("button", { name: "Deposit with permit" })).toBeDisabled();
    expect(await prompts(p)).toBe(0);
  });

  test("insufficient tQDAY → 'Not enough tQDAY' before signing", async ({ browser }) => {
    const pk = generatePrivateKey();
    const addr = privateKeyToAccount(pk).address;
    deal(addr, 1); // 1 tUSD8 (+ gas), then drain the gas
    rpc("anvil_setBalance", [addr, "0x0"]);
    const p = await as(browser, pk);
    await openLend(p);
    await p.getByLabel("Amount").first().fill("0.1");
    await p.getByRole("button", { name: "Deposit with permit" }).click();
    await expect(p.getByText(/Not enough tQDAY to pay gas/).first()).toBeVisible({ timeout: 30_000 });
    expect(await prompts(p)).toBe(0);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/drill-no-gas.png` });
  });

  test("user rejects the signature → 'You cancelled the signature.'", async ({ browser }) => {
    const p = await as(browser, key("LENDER_PRIVATE_KEY"), { reject: true });
    await openLend(p);
    await p.getByLabel("Amount").first().fill("0.1");
    await p.getByRole("button", { name: "Deposit with permit" }).click();
    await expect(p.getByText("You cancelled the signature.").first()).toBeVisible({ timeout: 30_000 });
    expect(await prompts(p)).toBe(1);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/drill-rejected.png` });
  });

  test("pending transaction survives navigating away and back", async ({ browser }) => {
    const pk = key("LENDER_PRIVATE_KEY");
    const owner = privateKeyToAccount(pk).address;
    const from = (await pc.getBlockNumber()) + 1n; // the head block may hold an earlier tx
    rpc("evm_setAutomine", ["false"]);
    rpc("evm_setIntervalMining", ["10"]);
    try {
      const p = await as(browser, pk);
      await openLend(p);
      await p.getByLabel("Amount").first().fill("0.1");
      await p.getByRole("button", { name: "Deposit with permit" }).click();
      const card = p.locator(".card", { hasText: "EIP-2612 permit" }).first();
      // a tx hash is shown only once the tx was sent; it isn't mined yet (10 s interval mining)
      await expect(card.getByText(/TX\s*0x[0-9a-f]{6}/i)).toBeVisible({ timeout: 30_000 });
      const sentHash = ((await card.innerText()).match(/0x[0-9a-f]{6}…[0-9a-f]{6}/i) ?? [""])[0];
      expect(sentHash).not.toBe("");
      expect(await deposits(owner, from)).toBe(0);
      await p.getByRole("link", { name: "Audit" }).first().click();
      await p.waitForURL(/\/app\/audit/);
      await p.getByRole("link", { name: "Lend" }).first().click();
      await p.waitForURL(/\/app\/lend/);
      // back on Lend: the card resumes with the same tx instead of resetting to idle
      await expect(card.getByText(sentHash).first()).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => deposits(owner, from), { timeout: 60_000 }).toBe(1);
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/drill-pending-recovered.png` });
    } finally {
      rpc("evm_setIntervalMining", ["0"]);
      rpc("evm_setAutomine", ["true"]);
    }
  });
});
