import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { createPublicClient, createWalletClient, http, parseAbiItem, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DEPLOYMENTS } from "../lib/autorail/generated/deployments";
import { autorailRolesAbi, autorailVaultAbi, receivableRegistryAbi, reputationRegistryAbi } from "../lib/autorail/generated/abis";
import { aevumLocalFork } from "../lib/chain/aevum";

/**
 * The solo-judge loop on the local fork, with ONE fresh wallet and nothing else:
 * onboard (drip → register → Seller) → invoice to Frontier Lab → auto-confirmed → accept the advance (Funded)
 * → Frontier Lab auto-pays (EIP-3009 via the relayer) → Repaid, ERC-8004 feedback 100.
 * Server env for this run: AUTOPAY_DELAY_SECONDS small (e.g. 8). Fork prerequisites: web/docs/UI.md "E2E on the fork".
 */
const pc = createPublicClient({ chain: aevumLocalFork, transport: http("http://127.0.0.1:8555") });
const D = (DEPLOYMENTS as unknown as Record<number, { contracts: Record<string, Address>; tUSD8: Address }>)[440050];
const SHOTS = process.env.E2E_SHOTS_DIR;
const ERC20 = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }] as const;

function key(name: string): Hex {
  const v = readFileSync(join(__dirname, "../../contracts/.env"), "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))![1].trim();
  return (v.startsWith("0x") ? v : `0x${v}`) as Hex;
}

test.beforeAll(async () => {
  // a lender deposit so the vault stays above its liquidity reserve after the advance
  const lender = privateKeyToAccount(key("LENDER_PRIVATE_KEY"));
  const wc = createWalletClient({ account: lender, chain: aevumLocalFork, transport: http("http://127.0.0.1:8555") });
  const amount = 300_000n;
  await pc.waitForTransactionReceipt({ hash: await wc.writeContract({ address: D.tUSD8, abi: ERC20, functionName: "approve", args: [D.contracts.vault, amount] }) });
  await pc.waitForTransactionReceipt({ hash: await wc.writeContract({ address: D.contracts.vault, abi: autorailVaultAbi, functionName: "deposit", args: [amount, lender.address] }) });
});

test("one fresh wallet: onboard → invoice → auto-confirmed → funded → auto-paid → Repaid, feedback 100", async ({ browser }) => {
  test.setTimeout(240_000);
  const pk = generatePrivateKey();
  const me = privateKeyToAccount(pk).address;
  const ctx = await browser.newContext();
  const ip = `203.0.113.${1 + Math.floor(Math.random() * 250)}`;
  await ctx.route("**/api/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-forwarded-for": ip } }));
  await ctx.addInitScript((k) => {
    (window as unknown as Record<string, unknown>).__AUTORAIL_TEST_KEY__ = k;
    window.localStorage.setItem("autorail:mode", "onchain");
  }, pk);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(`[pageerror] ${e.message.slice(0, 200)}`));

  // onboard
  await p.goto("/app/onboard?role=vendor", { waitUntil: "load" });
  await p.getByRole("button", { name: "Get 0.02 tQDAY" }).click();
  await expect(p.getByText(/Sent 0\.02 tQDAY for gas/)).toBeVisible({ timeout: 60_000 });
  await p.getByLabel("Agent name").fill("Solo Judge (e2e)");
  await p.getByRole("button", { name: "Register agent" }).click();
  await expect(p.getByText(/Agent #\d+ registered/)).toBeVisible({ timeout: 60_000 });
  await p.getByRole("button", { name: "Sign and get my role" }).click();
  await expect(p.getByText("Role assigned.")).toBeVisible({ timeout: 60_000 });
  const [, agentId] = (await pc.readContract({ address: D.contracts.roles, abi: autorailRolesAbi, functionName: "isAgent", args: [me, 1] })) as [boolean, bigint];

  // invoice to Frontier Lab → auto-confirmed
  await p.getByRole("link", { name: /Go to the Vendor screen/ }).click();
  await p.waitForURL(/\/app\/vendor/);
  await expect(p.getByText("Demo: Frontier Lab pays automatically within ~1 min (testnet, capped).")).toBeVisible({ timeout: 30_000 });
  const from = (await pc.getBlockNumber()) + 1n;
  await p.getByLabel("Amount").fill("0.05");
  await p.getByRole("button", { name: "Create invoice" }).click();
  await expect(p.getByText(/Frontier Lab confirmed it/)).toBeVisible({ timeout: 90_000 });
  const created = await pc.getLogs({
    address: D.contracts.registry,
    event: parseAbiItem("event ReceivableCreated(bytes32 indexed id, uint256 indexed sellerAgentId, uint256 indexed buyerAgentId, address seller, bytes32 invoiceHash, uint256 amount, uint64 dueDate)"),
    args: { sellerAgentId: agentId },
    fromBlock: from,
  });
  expect(created).toHaveLength(1);
  const id = created[0].args.id as Hex;

  // accept the advance → Funded → auto-pay countdown → paid
  await p.getByRole("button", { name: "Accept and fund advance" }).click({ timeout: 60_000 });
  await expect(p.getByText(/Frontier Lab pays this invoice automatically|Frontier Lab is signing the payment/)).toBeVisible({ timeout: 60_000 });
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/judge-autopay-countdown.png` });
  await expect(p.getByText(/Frontier Lab paid 0\.05 tUSD8/)).toBeVisible({ timeout: 120_000 });
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/judge-autopaid.png` });

  // onchain: Repaid, feedback 100 for the judge's agent
  const r = (await pc.readContract({ address: D.contracts.registry, abi: receivableRegistryAbi, functionName: "get", args: [id] })) as { state: number };
  expect(r.state).toBe(4);
  const [count, value] = (await pc.readContract({ address: D.contracts.reputation, abi: reputationRegistryAbi, functionName: "getSummary", args: [agentId, [D.contracts.router, D.contracts.facility], "credit", ""] })) as [bigint, bigint, number];
  expect(count).toBe(1n);
  expect(value).toBe(100n);

  // the waterfall is one click away
  await p.getByRole("link", { name: "View the waterfall →" }).click();
  await expect(p.getByText("Repayment", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/judge-waterfall.png` });
});
