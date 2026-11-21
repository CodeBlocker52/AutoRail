# CHAIN.md: QDay Aevum testnet, single source of truth

Verified 2026-11-21 (see `docs/reference/chain-probe.md` for raw evidence).

| Item | Value | Notes |
|---|---|---|
| Chain ID | **44005** (`0xabe5`) | Fork rehearsals use **440050** |
| RPC | `https://rpc-test.qday.info` | HTTPS only. **Treat WebSocket as unavailable**; poll |
| Explorer | `https://explorer-test.qday.info` (Blockscout) | Verification is **down**. Command kept ready below |
| Node client | cdk-erigon 2.0 (Polygon CDK validium) | |
| EVM | **Shanghai** | `evm_version = "shanghai"`; PUSH0 confirmed onchain. Cancun opcodes revert at runtime |
| Tx type | **Legacy (type 0)** | `forge script --legacy`, viem `type: "legacy"`. Headers do carry `baseFeePerGas` (7 wei), but type 0 is the proven path |
| Gas price | 1 gwei | 1 tQDAY ≈ 1,000,000,000 gas units |
| Block gas limit | 30,000,000 | |
| `eth_getLogs` | `toBlock − fromBlock ≤ 1000` | Chunk at **1,000 blocks** from the deploy block |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | Code present |
| tUSD8 | `0x456569838f1d43009A91ebA4263147Afd7233483` | FiatTokenProxy → impl `0xd6be708f…7597` (v2.2). 6 decimals. EIP-712 domain `tUSD8` / `2`. Has EIP-2612 permit, EIP-3009 transfer/receive/cancel, ERC-1271 via `bytes` overloads, blacklist, pause |
| tUSD8 DOMAIN_SEPARATOR | `0x7838e6c46f8f9874236c9747d9896552a03d22c7c3e701b198879de2cb658022` | Recomputed and matches |
| tUSD8 master minter (fork only) | `0x4d4b7031D35B74215bebe33F6AF6e682Ea99d0b1` | Used by `make deal` on chain 440050 |
| ERC-8004 | **No official deployment on Aevum** | We deploy the official `erc-8004-contracts` implementations (commit `b9e466c`) behind ERC1967 proxies |
| AA / bundler / paymaster | None on testnet | Budgets, caps, expiry and revoke live in `JobWallet` |
| Faucet | `https://faucet.qday.info/en` | 1 tUSD8 per claim per 24h |

## Toolchain pins
| Tool | Version |
|---|---|
| solc | 0.8.24 (same as the kit and ERC-8004 repo) |
| Foundry | forge 1.9.0 |
| OpenZeppelin Contracts | v5.4.0 (`c64a1ed`) |
| OpenZeppelin Contracts Upgradeable | v5.4.0 (`e725abd`), for the ERC-8004 registries only |
| forge-std | v1.17.0 (`f3dae6e`) |
| Optimizer | on, 200 runs |

## Rules for every contract
- Classic `ReentrancyGuard` (storage-based). **Never** `ReentrancyGuardTransient` or other `*Transient` contracts.
- `make build` = `forge build` + `node tools/check-shanghai.mjs out` (fails on BLOBHASH, BLOBBASEFEE, TLOAD, TSTORE, MCOPY).
- Local chains must run `anvil --hardfork shanghai` (`make fork` does this).

## Verification (when Blockscout verification comes back)
```bash
forge verify-contract <address> src/<File>.sol:<Contract> \
  --chain-id 44005 --verifier blockscout --verifier-url https://explorer-test.qday.info/api/ \
  --compiler-version v0.8.24 --evm-version shanghai --num-of-optimizations 200 \
  --constructor-args <abi-encoded args from deployments/44005.json>
```
