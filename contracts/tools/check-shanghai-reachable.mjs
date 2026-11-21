#!/usr/bin/env node
// Derived from Aevum Starter Kit's tools/check-shanghai.mjs (MIT, PQA Labs), extended with a reachability pass.
//
// Fails if any contract compiled from contracts/src can EXECUTE an opcode Aevum (Shanghai EVM) doesn't have.
//
// Why a second checker: the kit's linear scan treats every byte as an instruction. via-IR builds (the official
// ERC-8004 registries) append data blobs after the last instruction, and a data byte can equal 0x5c (TLOAD).
// Here a byte only counts as code if it is reachable from offset 0 or from ANY JUMPDEST. That is a superset of
// real control flow, because every JUMP/JUMPI target must be a JUMPDEST, so it can't miss a real use.
// The strict kit checker is still available as `make check-shanghai-strict`.
//
// Usage: node tools/check-shanghai-reachable.mjs [out]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CANCUN_ONLY = { 0x49: "BLOBHASH", 0x4a: "BLOBBASEFEE", 0x5c: "TLOAD", 0x5d: "TSTORE", 0x5e: "MCOPY" };
// Instructions after which execution never falls through: STOP RETURN REVERT INVALID SELFDESTRUCT JUMP
const TERMINATORS = new Set([0x00, 0xf3, 0xfd, 0xfe, 0xff, 0x56]);
const outDir = process.argv[2] ?? "out";

function* artifacts(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* artifacts(p);
    else if (name.endsWith(".json")) yield p;
  }
}

function analyse(hex) {
  const code = Buffer.from(hex.replace(/^0x/, ""), "hex");
  if (code.length === 0) return { reachable: [], data: [] };
  const metaLen = code.length >= 2 ? code.readUInt16BE(code.length - 2) + 2 : 0;
  const end = metaLen < code.length ? code.length - metaLen : code.length;
  const starts = [];
  for (let i = 0; i < end; i++) {
    starts.push(i);
    const op = code[i];
    if (op >= 0x60 && op <= 0x7f) i += op - 0x5f;
  }
  const index = new Map(starts.map((p, k) => [p, k]));
  const reach = new Set();
  const entries = [0, ...starts.filter((p) => code[p] === 0x5b)];
  for (const e of entries) {
    for (let k = index.get(e); k !== undefined && k < starts.length; k++) {
      const p = starts[k];
      if (reach.has(p)) break;
      reach.add(p);
      if (TERMINATORS.has(code[p])) break;
    }
  }
  const reachable = [];
  const data = [];
  for (const p of starts) {
    const name = CANCUN_ONLY[code[p]];
    if (!name) continue;
    (reach.has(p) ? reachable : data).push(`${name} at byte ${p}`);
  }
  return { reachable, data };
}

let checked = 0;
let failed = 0;
for (const file of artifacts(outDir)) {
  const a = JSON.parse(readFileSync(file, "utf8"));
  const source = Object.keys(a.metadata?.settings?.compilationTarget ?? {})[0] ?? "";
  if (!source.startsWith("src/")) continue;
  for (const [kind, hex] of [["runtime", a.deployedBytecode?.object], ["creation", a.bytecode?.object]]) {
    if (!hex || hex === "0x") continue;
    checked++;
    const { reachable, data } = analyse(hex);
    if (reachable.length) {
      failed++;
      console.error(`✗ ${source} (${kind}): ${reachable.join(", ")}`);
    } else if (data.length) {
      console.log(`· ${source} (${kind}): ${data.join(", ")} in unreachable data (not executable)`);
    }
  }
}
if (checked === 0) {
  console.error(`No artifacts from src/ found in ${outDir}. Run \`forge build\` first.`);
  process.exit(1);
}
if (failed) {
  console.error("\nThese opcodes don't exist on Aevum. Set evm_version = \"shanghai\" in foundry.toml.");
  process.exit(1);
}
console.log(`✓ ${checked} bytecode blobs checked: no reachable Cancun-only opcode (Shanghai-safe).`);
