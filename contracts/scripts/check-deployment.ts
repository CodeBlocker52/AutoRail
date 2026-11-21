/**
 * Proves a deployment over RPC (Blockscout verification is down): code exists and its hash, the vault's asset,
 * every wiring address, proxy implementations, owners, agent ownership, roles and buyer tier.
 * Prints a markdown table for the README. Exits non-zero on any failed check.
 *
 *   pnpm exec tsx scripts/check-deployment.ts --network aevum|fork
 */
import { getAddress, keccak256, type Address, type Hex } from "viem";
import { abi, addressOf, loadDeployment, parseArgs, publicClientFor, withRetry } from "./e2e/lib";

const { network } = parseArgs();
const client = publicClientFor(network);
const chainId = await client.getChainId();
const d = loadDeployment(chainId);
const raw = d.raw;
let failures = 0;
const checks: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = "") => {
  checks.push([name, ok, detail]);
  if (!ok) failures++;
};
const read = <T>(address: Address, a: unknown, functionName: string, args: readonly unknown[] = []) =>
  withRetry(functionName, () => client.readContract({ address, abi: a, functionName, args } as never)) as Promise<T>;
const eq = (a: string, b: string) => getAddress(a) === getAddress(b);

console.log(`\n${raw.network} (chain ${chainId}) · deploy block ${raw.deployBlock} · commit ${raw.source.commit ?? "n/a"}\n`);
console.log("| Contract | Address | Code size | Code hash |");
console.log("|---|---|---|---|");
for (const [name, c] of Object.entries(raw.contracts as Record<string, { address: Address }>)) {
  const code = (await withRetry("getCode", () => client.getCode({ address: c.address }))) ?? "0x";
  const size = (code.length - 2) / 2;
  check(`${name} has code`, size > 0, c.address);
  console.log(`| ${name} | \`${c.address}\` | ${size} B | \`${size ? keccak256(code as Hex).slice(0, 18) : "—"}…\` |`);
}

// wiring
check("vault.asset == tUSD8", eq(await read(d.vault, abi.vault, "asset"), d.tUSD8));
check("vault.facility", eq(await read(d.vault, abi.vault, "facility"), d.facility));
check("vault.router", eq(await read(d.vault, abi.vault, "router"), d.router));
check("registry.facility", eq(await read(d.registry, abi.registry, "facility"), d.facility));
check("registry.repaymentRouter", eq(await read(d.registry, abi.registry, "repaymentRouter"), d.router));
check("registry.roles", eq(await read(d.registry, abi.registry, "roles"), d.roles));
check("factory.facility", eq(await read(d.factory, abi.factory, "facility"), d.facility));
check("factory.router", eq(await read(d.factory, abi.factory, "router"), d.router));
check("factory.implementation", eq(await read(d.factory, abi.factory, "implementation"), raw.contracts.JobWalletImplementation.address));
check("facility.router", eq(await read(d.facility, abi.facility, "router"), d.router));
check("facility.vault", eq(await read(d.facility, abi.facility, "vault"), d.vault));
check("facility.registry", eq(await read(d.facility, abi.facility, "registry"), d.registry));
check("facility.reputation", eq(await read(d.facility, abi.facility, "reputation"), d.reputation));
check("router.token == tUSD8", eq(await read(d.router, abi.router, "token"), d.tUSD8));
check("router.facility", eq(await read(d.router, abi.router, "facility"), d.facility));
check("router.vault", eq(await read(d.router, abi.router, "vault"), d.vault));
check("roles.identity", eq(await read(d.roles, abi.roles, "identity"), d.identity));
check("reputation.getIdentityRegistry", eq(await read(d.reputation, abi.reputation, "getIdentityRegistry"), d.identity));
const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const impl = async (p: Address) => getAddress(`0x${((await client.getStorageAt({ address: p, slot: implSlot })) ?? "0x").slice(-40)}`);
check("IdentityRegistry proxy → our impl", eq(await impl(d.identity), raw.contracts.IdentityRegistryImpl.address));
check("ReputationRegistry proxy → our impl", eq(await impl(d.reputation), raw.contracts.ReputationRegistryImpl.address));

// The implementations must be the OFFICIAL ERC-8004 code: on-chain runtime == compiled upstream source
// (src/erc8004/*, byte-identical to erc-8004-contracts@b9e466c), with immutable slots (UUPS `__self`) masked.
const { readFileSync } = await import("node:fs");
async function matchesArtifact(address: Address, artifact: string) {
  const art = JSON.parse(readFileSync(`out/${artifact}`, "utf8"));
  const onchain = ((await client.getCode({ address })) ?? "0x").slice(2);
  const compiled = (art.deployedBytecode.object as string).slice(2);
  if (onchain.length !== compiled.length) return { ok: false, detail: `size ${onchain.length / 2} vs ${compiled.length / 2}` };
  const mask = (hex: string) => {
    const b = hex.split("");
    for (const refs of Object.values(art.deployedBytecode.immutableReferences ?? {}) as { start: number; length: number }[][]) {
      for (const r of refs) for (let i = r.start * 2; i < (r.start + r.length) * 2; i++) b[i] = "0";
    }
    return b.join("");
  };
  const ok = mask(onchain) === mask(compiled);
  return { ok, detail: `runtime ${keccak256(`0x${mask(onchain)}`).slice(0, 18)}… ${ok ? "==" : "!="} compiled official source` };
}
const idImpl = await matchesArtifact(raw.contracts.IdentityRegistryImpl.address, "IdentityRegistryUpgradeable.sol/IdentityRegistryUpgradeable.json");
check("IdentityRegistry impl is the official ERC-8004 code", idImpl.ok, idImpl.detail);
const repImpl = await matchesArtifact(raw.contracts.ReputationRegistryImpl.address, "ReputationRegistryUpgradeable.sol/ReputationRegistryUpgradeable.json");
check("ReputationRegistry impl is the official ERC-8004 code", repImpl.ok, repImpl.detail);
const idVersion = await read<string>(d.identity, abi.identity, "getVersion");
const repVersion = await read<string>(d.reputation, abi.reputation, "getVersion");
check("ERC-8004 versions", idVersion === "2.0.0" && repVersion === "2.0.0", `identity ${idVersion}, reputation ${repVersion}`);
const idOwner = await read<Address>(d.identity, abi.identity, "owner");
const repOwner = await read<Address>(d.reputation, abi.reputation, "owner");
check("IdentityRegistry proxy owner == admin", eq(idOwner, raw.admin), idOwner);
check("ReputationRegistry proxy owner == admin", eq(repOwner, raw.admin), repOwner);
check("facility periods (grace/default)", true, `${await read(d.facility, abi.facility, "gracePeriod")}s / ${await read(d.facility, abi.facility, "defaultPeriod")}s`);
for (const name of ["AutorailRoles", "AutorailVault", "ReceivableRegistry", "JobWalletFactory", "CreditFacility", "RepaymentRouter"]) {
  const owner = await read<Address>(raw.contracts[name].address, abi.vault, "owner");
  check(`${name}.owner`, eq(owner, raw.admin) || eq(owner, raw.deployer), owner);
}

// agents
const expect: Record<string, [string, number]> = {
  "lumen-data": ["SELLER_ADDRESS", 1],
  "frontier-lab": ["BUYER_ADDRESS", 2],
  underwriter: ["UNDERWRITER_ADDRESS", 3],
  payout: ["PAYOUT_SESSION_ADDRESS", 4],
  "kestrel-gpu": ["MERCHANT_ADDRESS", 5],
};
for (const [slug, [envVar, role]] of Object.entries(expect)) {
  const id = d.agents?.[slug];
  if (id === undefined) {
    check(`agent ${slug} registered`, false, "missing from deployments json");
    continue;
  }
  const owner = await read<Address>(d.identity, abi.identity, "ownerOf", [BigInt(id)]);
  check(`agent ${slug} #${id} owner`, eq(owner, addressOf(envVar)), owner);
  check(`agent ${slug} #${id} role`, (await read<number>(d.roles, abi.roles, "roleOf", [BigInt(id)])) === role);
}
const buyerId = d.agents?.["frontier-lab"];
check("buyer tier = 1", buyerId !== undefined && (await read<number>(d.roles, abi.roles, "buyerTier", [BigInt(buyerId)])) === 1);

console.log("\n| Check | Result | Detail |\n|---|---|---|");
for (const [name, ok, detail] of checks) console.log(`| ${name} | ${ok ? "✅" : "❌"} | ${detail} |`);
console.log(`\n${checks.length - failures}/${checks.length} checks passed.`);
process.exit(failures ? 1 : 0);
