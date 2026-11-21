#!/usr/bin/env node
// Builds deployments/<chainId>.json from the Deploy/RegisterAgents outputs, the Foundry broadcast log, git and
// foundry.toml, and exports ABIs to deployments/abi/. Contains addresses and public tx data only (no secrets).
// Usage: node scripts/write-deployment.mjs <chainId>
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const chainId = process.argv[2];
if (!chainId) throw new Error("usage: write-deployment.mjs <chainId>");
const isAevum = chainId === "44005";
const explorer = "https://explorer-test.qday.info";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const addresses = read(`deployments/${chainId}.addresses.json`);
const agentsPath = `deployments/${chainId}.agents.json`;
const agents = existsSync(agentsPath) ? read(agentsPath) : {};

// broadcast log: tx hashes, blocks, constructor args
const bcPath = `broadcast/Deploy.s.sol/${chainId}/run-latest.json`;
const contracts = {};
let deployBlock = null;
const deployTxs = [];
if (existsSync(bcPath)) {
  const bc = read(bcPath);
  const receipts = new Map(bc.receipts.map((r) => [r.transactionHash, r]));
  for (const tx of bc.transactions) {
    const rc = receipts.get(tx.hash);
    const block = rc ? parseInt(rc.blockNumber, 16) : null;
    if (block !== null && (deployBlock === null || block < deployBlock)) deployBlock = block;
    deployTxs.push({ hash: tx.hash, type: tx.transactionType, contract: tx.contractName ?? null, function: tx.function ?? null, block });
    if (tx.transactionType === "CREATE" && tx.contractAddress) {
      contracts[tx.contractAddress.toLowerCase()] = { deployTx: tx.hash, block, constructorArgs: tx.arguments ?? [] };
    }
  }
}

const sh = (c) => {
  try {
    return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const commit = sh("git rev-parse HEAD");
const dirty = sh("git status --porcelain -- src script") ? true : false;
const remote = sh("git config --get remote.origin.url");
const repoUrl = remote ? remote.replace(/^git@github.com:/, "https://github.com/").replace(/\.git$/, "") : null;
const lock = read("foundry.lock");
const toml = readFileSync("foundry.toml", "utf8");
const solc = /solc_version\s*=\s*"([^"]+)"/.exec(toml)?.[1];
const evm = /evm_version\s*=\s*"([^"]+)"/.exec(toml)?.[1];

const names = [
  "IdentityRegistry",
  "IdentityRegistryImpl",
  "ReputationRegistry",
  "ReputationRegistryImpl",
  "ERC8004Bootstrap",
  "AutorailRoles",
  "AutorailVault",
  "ReceivableRegistry",
  "JobWalletImplementation",
  "JobWalletFactory",
  "CreditFacility",
  "RepaymentRouter",
];
const table = {};
for (const n of names) {
  const addr = addresses[n];
  const meta = contracts[addr?.toLowerCase()] ?? {};
  table[n] = {
    address: addr,
    explorer: isAevum ? `${explorer}/address/${addr}` : null,
    deployTx: meta.deployTx ?? null,
    deployTxUrl: isAevum && meta.deployTx ? `${explorer}/tx/${meta.deployTx}` : null,
    block: meta.block ?? null,
    constructorArgs: meta.constructorArgs ?? [],
  };
}

const out = {
  chainId: Number(chainId),
  network: isAevum ? "QDay Aevum testnet" : "Aevum fork (local)",
  rpc: isAevum ? "https://rpc-test.qday.info" : "http://127.0.0.1:8555",
  deployer: addresses.deployer,
  admin: addresses.admin,
  tUSD8: addresses.tUSD8,
  deployBlock,
  generatedAt: new Date().toISOString(),
  source: {
    commit,
    dirtyWorkingTree: dirty,
    commitUrl: repoUrl && commit ? `${repoUrl}/tree/${commit}` : null,
    solc,
    evmVersion: evm,
    optimizerRuns: 200,
    openzeppelin: lock["lib/openzeppelin-contracts"]?.tag ?? null,
    openzeppelinUpgradeable: lock["lib/openzeppelin-contracts-upgradeable"]?.tag ?? null,
    erc8004Upstream: "erc-8004/erc-8004-contracts@b9e466c250744a7e06b13dff9d3c2844ed64f825",
  },
  contracts: table,
  agents,
  deployTxs,
};
writeFileSync(`deployments/${chainId}.json`, JSON.stringify(out, null, 2) + "\n");

// ABIs for the frontend and scripts
mkdirSync("deployments/abi", { recursive: true });
const abiSources = {
  AutorailRoles: "AutorailRoles.sol/AutorailRoles.json",
  AutorailVault: "AutorailVault.sol/AutorailVault.json",
  ReceivableRegistry: "ReceivableRegistry.sol/ReceivableRegistry.json",
  JobWallet: "JobWallet.sol/JobWallet.json",
  JobWalletFactory: "JobWalletFactory.sol/JobWalletFactory.json",
  CreditFacility: "CreditFacility.sol/CreditFacility.json",
  RepaymentRouter: "RepaymentRouter.sol/RepaymentRouter.json",
  IdentityRegistry: "IdentityRegistryUpgradeable.sol/IdentityRegistryUpgradeable.json",
  ReputationRegistry: "ReputationRegistryUpgradeable.sol/ReputationRegistryUpgradeable.json",
};
for (const [name, path] of Object.entries(abiSources)) {
  const art = read(`out/${path}`);
  writeFileSync(`deployments/abi/${name}.json`, JSON.stringify(art.abi, null, 2) + "\n");
}
console.log(`wrote deployments/${chainId}.json (deploy block ${deployBlock}) and deployments/abi/*.json`);
