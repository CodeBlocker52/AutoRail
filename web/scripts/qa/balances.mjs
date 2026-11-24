// Prints tQDAY / tUSD8 balances of every *_ADDRESS in contracts/.env and web/.env.qa (addresses only; keys never read).
// usage: node scripts/qa/balances.mjs [rpcUrl] [--json]
import { readFileSync, existsSync } from "node:fs";
import { createPublicClient, formatUnits, http } from "viem";

const rpc = process.argv.find((a) => a.startsWith("http")) ?? "https://rpc-test.qday.info";
const asJson = process.argv.includes("--json");
const T = "0x456569838f1d43009A91ebA4263147Afd7233483";
const files = ["../contracts/.env", ".env.qa"].filter(existsSync);
const addrs = [];
for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/^([A-Z_]+)_ADDRESS=(0x[0-9a-fA-F]{40})/gm)) if (m[1] !== "ADMIN") addrs.push([m[1], m[2]]);
const c = createPublicClient({ transport: http(rpc) });
const abi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }];
const rows = await Promise.all(
  addrs.map(async ([n, a]) => ({
    name: n,
    address: a,
    tQDAY: formatUnits(await c.getBalance({ address: a }), 18),
    tUSD8: formatUnits(await c.readContract({ address: T, abi, functionName: "balanceOf", args: [a] }), 6),
  })),
);
if (asJson) console.log(JSON.stringify(rows, null, 2));
else for (const r of rows) console.log(`${r.name.padEnd(16)} ${r.address}  tQDAY ${Number(r.tQDAY).toFixed(6).padStart(10)}  tUSD8 ${r.tUSD8}`);
