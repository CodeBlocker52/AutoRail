import "server-only";
import { formatEther, formatUnits, getAddress, parseEther, zeroAddress, type Address, type Hash, type Hex } from "viem";
import { autorailRolesAbi, autorailVaultAbi, identityRegistryAbi, receivableRegistryAbi } from "@/lib/autorail/generated/abis";
import { AEVUM_CHAIN_ID, AEVUM_FORK_CHAIN_ID, TARGET_CHAIN_ID } from "@/lib/chain/aevum";
import { stateName } from "@/lib/autorail/mapping";
import { CONFIRMATION_TYPES } from "@/lib/autorail/tokenDomain";
import { account, requireAccount } from "./env";
import { deployment, publicClient, send, sendValue, simulate } from "./chain";
import { OpError } from "./ops";
import { store } from "./store";
import { log } from "./log";
import { assertNotPaused, isPaused, takeDaily, usage } from "./caps";
import { liquidityReserve } from "./ops";
import { AUTO_PAY_MAX } from "./autopayRules";
import { autoPayDelaySeconds, labTreasuryReserve } from "./autopay";

const c = () => deployment().contracts as Record<string, Address>;
const ERC20_BAL = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;
const ROLE = { vendor: { name: "Seller", index: 1 }, lab: { name: "Buyer", index: 2 } } as const;
export type OnboardRole = keyof typeof ROLE;

/** Exact text the wallet signs (EIP-191). The server rebuilds it from the request fields, so nothing else can be signed in. */
export function onboardingMessage(p: { address: Address; agentId: bigint | number; role: OnboardRole; issuedAt: string }) {
  return [
    "Autorail onboarding (testnet only)",
    `Wallet: ${getAddress(p.address)}`,
    `Agent: #${p.agentId}`,
    `Role: ${ROLE[p.role].name}`,
    `Chain: ${TARGET_CHAIN_ID}`,
    `Issued: ${p.issuedAt}`,
  ].join("\n");
}

function testnetOnly() {
  if (TARGET_CHAIN_ID !== AEVUM_CHAIN_ID && TARGET_CHAIN_ID !== AEVUM_FORK_CHAIN_ID) throw new OpError("NotTestnet", "Onboarding is testnet-only.", 403);
}

// ─────────────────────────── onboarding ───────────────────────────

export interface OnboardRequest {
  address: Address;
  agentId: bigint;
  role: OnboardRole;
  issuedAt: string;
  signature: Hex;
}

/**
 * Assign Seller (vendor) or Buyer (lab, tier 1) to an ERC-8004 agent the caller just registered from their own wallet.
 * Rules: testnet only; the signer must own the agent; the agent must have NO role yet (our agents #0–#4 can never be
 * re-roled); never Underwriter / Payout / Merchant; idempotent (same wallet + role → returns the existing agent).
 */
export async function onboard(req: OnboardRequest) {
  testnetOnly();
  assertNotPaused();
  const client = publicClient();
  const addr = getAddress(req.address);
  const roleIdx = ROLE[req.role].index;

  const issued = Date.parse(req.issuedAt);
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > 10 * 60_000) throw new OpError("SignatureExpired", "The onboarding signature is older than 10 minutes. Sign again.");
  const ok = await client.verifyMessage({ address: addr, message: onboardingMessage({ ...req, address: addr }), signature: req.signature });
  if (!ok) throw new OpError("InvalidSignature", "The signature doesn't match this wallet.");

  const owner = (await client.readContract({ address: c().identity, abi: identityRegistryAbi, functionName: "ownerOf", args: [req.agentId] }).catch(() => zeroAddress)) as Address;
  if (owner === zeroAddress) throw new OpError("UnknownAgent", `Agent #${req.agentId} isn't registered in the ERC-8004 Identity Registry.`);
  if (getAddress(owner) !== addr) throw new OpError("NotAgentOwner", `Agent #${req.agentId} isn't owned by this wallet.`, 403);
  // Idempotent: this wallet already speaks for an agent in this role (checked after ownership, so a request for
  // someone else's agent is refused even if the caller is onboarded)
  const [has, existing] = (await client.readContract({ address: c().roles, abi: autorailRolesAbi, functionName: "isAgent", args: [addr, roleIdx] })) as [boolean, bigint];
  if (has) return { agentId: Number(existing), role: ROLE[req.role].name, txHashes: [] as Hash[], alreadyOnboarded: true };
  const current = Number(await client.readContract({ address: c().roles, abi: autorailRolesAbi, functionName: "roleOf", args: [req.agentId] }));
  if (current !== 0) throw new OpError("AlreadyHasRole", `Agent #${req.agentId} already has a role. Register a new agent for a different role.`, 409);

  if (!(await store.claim(`onboard:inflight:${TARGET_CHAIN_ID}:${req.agentId}`, 180))) throw new OpError("InFlight", "This agent is already being onboarded.", 409);
  let slot: { release: () => Promise<void> } | null = null;
  try {
    slot = await takeDaily(store, TARGET_CHAIN_ID, "onboard");
    const operator = requireAccount("ROLES_OPERATOR_PRIVATE_KEY");
    const hashes: Hash[] = [];
    const setRole = { address: c().roles, abi: autorailRolesAbi, functionName: "setRole", args: [req.agentId, roleIdx] } as const;
    await simulate(operator, setRole); // fails fast (e.g. OwnableUnauthorizedAccount) before any tx
    const r1 = await send(operator, setRole);
    if (r1.status !== "success") throw new OpError(r1.errorName ?? "Reverted", "Role assignment reverted.", 500, r1.hash);
    hashes.push(r1.hash);
    if (req.role === "lab") {
      const r2 = await send(operator, { address: c().roles, abi: autorailRolesAbi, functionName: "setBuyerTier", args: [req.agentId, 1] });
      if (r2.status !== "success") throw new OpError(r2.errorName ?? "Reverted", "Buyer tier assignment reverted.", 500, r2.hash);
      hashes.push(r2.hash);
    }
    await store.set(`onboarded:${TARGET_CHAIN_ID}:${req.agentId}`, { address: addr, role: req.role, at: Date.now(), txHashes: hashes }, 365 * 86_400);
    log("info", "onboard", { agentId: String(req.agentId), role: req.role, address: addr, txs: hashes.length });
    return { agentId: Number(req.agentId), role: ROLE[req.role].name, txHashes: hashes, alreadyOnboarded: false };
  } catch (e) {
    if (slot) await slot.release();
    throw e;
  } finally {
    await store.del(`onboard:inflight:${TARGET_CHAIN_ID}:${req.agentId}`);
  }
}

// ─────────────────────────── gas drip ───────────────────────────

export const DRIP_AMOUNT = parseEther("0.02");
export const DRIP_BELOW = parseEther("0.01");

/** 0.02 tQDAY once per wallet if it holds < 0.01 tQDAY. Capped by count and by the drip wallet's balance. No tUSD8. */
export async function drip(to: Address, rateLimited: () => Promise<boolean> = async () => false) {
  testnetOnly();
  assertNotPaused();
  const client = publicClient();
  const addr = getAddress(to);
  const bal = await client.getBalance({ address: addr });
  if (bal >= DRIP_BELOW) return { dripped: false, reason: "has-gas", balance: formatEther(bal) };
  const wallet = requireAccount("DRIP_PRIVATE_KEY");
  if ((await client.getBalance({ address: wallet.address })) < DRIP_AMOUNT + parseEther("0.001")) {
    throw new OpError("DripEmpty", "The gas drip is empty. Get tQDAY from https://faucet.qday.info/en", 503);
  }
  // count only real drips against the caller's limit (a "you already have gas" answer is free)
  if (await rateLimited()) throw new OpError("RateLimited", "The gas drip allows 3 wallets per network per day. Use https://faucet.qday.info/en", 429);
  const onceKey = `drip:${TARGET_CHAIN_ID}:${addr.toLowerCase()}`;
  if (!(await store.claim(onceKey, 365 * 86_400))) throw new OpError("AlreadyDripped", "This wallet already received gas from the drip. Use https://faucet.qday.info/en", 409);
  let slot: { release: () => Promise<void> };
  try {
    slot = await takeDaily(store, TARGET_CHAIN_ID, "drip");
  } catch (e) {
    await store.del(onceKey);
    throw e;
  }
  try {
    const sent = await sendValue(wallet, addr, DRIP_AMOUNT);
    log("info", "drip", { to: addr, hash: sent.hash });
    return { dripped: true, amount: formatEther(DRIP_AMOUNT), hash: sent.hash, block: sent.block };
  } catch (e) {
    await store.del(onceKey); // allow a retry after a failed send
    await slot.release();
    throw e;
  }
}

// ─────────────────────────── lab agent auto-confirm ───────────────────────────

export const AUTO_CONFIRM_MAX = 100_000n; // 0.10 tUSD8 (same as the auto-pay cap)

/**
 * Our "Frontier Lab" buyer agent confirms (EIP-712, payee = router) invoices addressed to it by ONBOARDED vendors, up to
 * 0.20 tUSD8, so a solo judge can complete the flow. Our own seller (#0) and unknown sellers are refused.
 */
export async function labAutoConfirm(receivableId: Hex) {
  testnetOnly();
  assertNotPaused();
  const client = publicClient();
  const d = deployment();
  const r = (await client.readContract({ address: c().registry, abi: receivableRegistryAbi, functionName: "get", args: [receivableId] }).catch(() => null)) as
    | { invoiceHash: Hex; seller: Address; sellerAgentId: bigint; buyerAgentId: bigint; amount: bigint; dueDate: bigint; state: number }
    | null;
  if (!r || r.state === 0) throw new OpError("UnknownReceivable", "Unknown invoice.", 404);
  const state = stateName(r.state);
  if (state !== "Created") return { confirmed: true, state, txHash: null as Hash | null, already: true };
  const lab = BigInt(d.agents["frontier-lab"]);
  if (r.buyerAgentId !== lab) throw new OpError("NotOurLab", "Only invoices addressed to the Frontier Lab agent are auto-confirmed.", 403);
  if (r.amount > AUTO_CONFIRM_MAX) throw new OpError("OverAutoConfirmCap", "Frontier Lab auto-confirms invoices up to 0.10 tUSD8 only.", 403);
  const onboarded = await store.get<{ role: string }>(`onboarded:${TARGET_CHAIN_ID}:${r.sellerAgentId}`);
  if (!onboarded || onboarded.role !== "vendor") throw new OpError("SellerNotOnboarded", "Auto-confirm is for vendors onboarded through the app.", 403);

  if (!(await store.claim(`labconfirm:${TARGET_CHAIN_ID}:${receivableId}`, 300))) throw new OpError("InFlight", "This invoice is already being confirmed.", 409);
  let slot: { release: () => Promise<void> } | null = null;
  try {
    slot = await takeDaily(store, TARGET_CHAIN_ID, "autoConfirm");
    const buyer = requireAccount("BUYER_PRIVATE_KEY");
    const nonce = (await client.readContract({ address: c().registry, abi: receivableRegistryAbi, functionName: "nonces", args: [buyer.address] })) as bigint;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const signature = await buyer.signTypedData({
      domain: { name: "Autorail ReceivableRegistry", version: "1", chainId: TARGET_CHAIN_ID, verifyingContract: c().registry },
      types: CONFIRMATION_TYPES,
      primaryType: "Confirmation",
      message: { id: receivableId, invoiceHash: r.invoiceHash, seller: r.seller, buyer: buyer.address, amount: r.amount, dueDate: r.dueDate, payee: c().router, nonce, deadline },
    });
    const call = { address: c().registry, abi: receivableRegistryAbi, functionName: "confirm", args: [receivableId, buyer.address, c().router, deadline, signature] } as const;
    await simulate(buyer, call);
    const sent = await send(buyer, call);
    if (sent.status !== "success") throw new OpError(sent.errorName ?? "Reverted", "Confirmation reverted.", 500, sent.hash);
    log("info", "lab.autoconfirm", { receivableId, hash: sent.hash });
    return { confirmed: true, state: "Confirmed", txHash: sent.hash, already: false };
  } catch (e) {
    if (slot) await slot.release();
    throw e;
  } finally {
    await store.del(`labconfirm:${TARGET_CHAIN_ID}:${receivableId}`);
  }
}

// ─────────────────────────── health ───────────────────────────

const WALLETS: { key: Parameters<typeof account>[0]; label: string; warnBelow: string }[] = [
  { key: "RELAYER_PRIVATE_KEY", label: "relayer", warnBelow: "0.02" },
  { key: "PAYOUT_SESSION_PRIVATE_KEY", label: "payoutAgent", warnBelow: "0.01" },
  { key: "BUYER_PRIVATE_KEY", label: "labAgent", warnBelow: "0.01" },
  { key: "ROLES_OPERATOR_PRIVATE_KEY", label: "rolesOperator", warnBelow: "0.005" },
  { key: "DRIP_PRIVATE_KEY", label: "drip", warnBelow: "0.04" },
  { key: "SELLER_PRIVATE_KEY", label: "demoSeller", warnBelow: "0.01" },
  { key: "LENDER_PRIVATE_KEY", label: "demoLender", warnBelow: "0.005" },
];

let healthCache: { at: number; value: unknown } | null = null;

/** Public status. Never includes secrets: addresses and balances only. Cached 15 s per instance. */
export async function health() {
  if (healthCache && Date.now() - healthCache.at < 15_000) return healthCache.value;
  const d = deployment();
  const client = publicClient();
  const t0 = Date.now();
  let latestBlock: number | null = null;
  let rpcError: string | null = null;
  try {
    latestBlock = Number(await Promise.race([client.getBlockNumber(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 6_000))]));
  } catch (e) {
    rpcError = String((e as Error).message ?? e).slice(0, 80);
  }
  const rpcMs = Date.now() - t0;
  let kv: { backend: string; ok: boolean } = { backend: store.kind, ok: false };
  try {
    await store.set("health:ping", Date.now(), 60);
    kv = { backend: store.kind, ok: (await store.get<number>("health:ping")) !== null };
  } catch {
    /* kv down */
  }
  const wallets: Record<string, { address: Address; tQDAY: string; warnBelow: string; low: boolean } | { configured: false }> = {};
  let ownsRoles: boolean | null = null;
  if (latestBlock !== null) {
    await Promise.all(
      WALLETS.map(async (w) => {
        const a = account(w.key);
        if (!a) return void (wallets[w.label] = { configured: false });
        const bal = await client.getBalance({ address: a.address });
        wallets[w.label] = { address: a.address, tQDAY: formatEther(bal), warnBelow: w.warnBelow, low: bal < parseEther(w.warnBelow) };
      }),
    );
    const op = account("ROLES_OPERATOR_PRIVATE_KEY");
    if (op) {
      const owner = (await client.readContract({ address: c().roles, abi: autorailRolesAbi, functionName: "owner" }).catch(() => null)) as Address | null;
      ownsRoles = owner ? getAddress(owner) === op.address : null;
    }
  }
  // caps, kill switch and reserves
  const capUsage = await usage(store, TARGET_CHAIN_ID).catch(() => null);
  let reserves: Record<string, string | number> | null = null;
  if (latestBlock !== null) {
    try {
      const idle = (await client.readContract({ address: c().vault, abi: autorailVaultAbi, functionName: "idle" })) as bigint;
      const lab = account("BUYER_PRIVATE_KEY");
      const treasury = lab ? ((await client.readContract({ address: d.tUSD8, abi: ERC20_BAL, functionName: "balanceOf", args: [lab.address] })) as bigint) : 0n;
      const spare = treasury - labTreasuryReserve();
      reserves = {
        vaultIdle: formatUnits(idle, 6),
        liquidityReserve: formatUnits(liquidityReserve(), 6),
        vaultAvailableForOnboardedVendors: formatUnits(idle > liquidityReserve() ? idle - liquidityReserve() : 0n, 6),
        labTreasury: formatUnits(treasury, 6),
        labTreasuryReserve: formatUnits(labTreasuryReserve(), 6),
        autoPaysFundedByTreasury: spare > 0n ? Number(spare / AUTO_PAY_MAX) : 0,
        autoPayMax: formatUnits(AUTO_PAY_MAX, 6),
        autoPayDelaySeconds: autoPayDelaySeconds(),
      };
    } catch {
      /* reserves unavailable */
    }
  }
  const lows = Object.entries(wallets).filter(([, w]) => "low" in w && w.low).map(([k]) => k);
  const status = latestBlock === null ? "down" : !kv.ok || lows.length || ownsRoles === false ? "degraded" : "ok";
  const value = {
    status,
    mode: process.env.NEXT_PUBLIC_AUTORAIL_MODE === "onchain" ? "onchain" : "mock",
    chainId: TARGET_CHAIN_ID,
    rpc: { latestBlock, ms: rpcMs, error: rpcError },
    contracts: d.contracts,
    tUSD8: d.tUSD8,
    deployBlock: d.deployBlock,
    deploymentCommit: d.commit,
    appCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    kv,
    features: {
      relay: !!account("RELAYER_PRIVATE_KEY"),
      underwrite: !!account("UNDERWRITER_PRIVATE_KEY"),
      payoutAgent: !!account("PAYOUT_SESSION_PRIVATE_KEY"),
      onboarding: !!account("ROLES_OPERATOR_PRIVATE_KEY") && ownsRoles !== false,
      drip: !!account("DRIP_PRIVATE_KEY"),
      labAutoConfirm: !!account("BUYER_PRIVATE_KEY"),
      labAutoPay: !!account("BUYER_PRIVATE_KEY") && !!account("RELAYER_PRIVATE_KEY"),
      runLive: ["LENDER_PRIVATE_KEY", "SELLER_PRIVATE_KEY", "BUYER_PRIVATE_KEY"].every((k) => !!account(k as never)),
    },
    rolesOperatorOwnsRoles: ownsRoles,
    paused: isPaused(),
    limits: capUsage,
    reserves,
    wallets,
    warnings: [
      ...lows.map((k) => `${k} is below its tQDAY threshold`),
      ...(kv.ok ? [] : ["shared store unavailable"]),
      ...(kv.backend === "memory" && process.env.VERCEL ? ["KV_REST_API_URL / KV_REST_API_TOKEN not set: idempotency and rate limits are per instance"] : []),
      ...(ownsRoles === false ? ["ROLES_OPERATOR does not own AutorailRoles: onboarding will fail"] : []),
      ...(isPaused() ? ["DEMO_PAUSED: spending routes are paused"] : []),
      ...(reserves && reserves.autoPaysFundedByTreasury === 0 ? ["lab treasury at its reserve: auto-pay is skipping (run scripts/ops/topup.ts)"] : []),
    ],
    checkedAt: new Date().toISOString(),
  };
  healthCache = { at: Date.now(), value };
  return value;
}
