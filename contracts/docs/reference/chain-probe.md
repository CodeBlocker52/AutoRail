Source: live RPC `https://rpc-test.qday.info` via `cast` (Foundry 1.9.0)
Probed: 2026-11-21

# Aevum testnet probe

| Check | Result |
|---|---|
| `eth_chainId` | **44005** |
| Latest block at probe | 3,748,381 (2026-11-21) |
| Client | `cdk-erigon/2.0-qday-v2.61.19-validium` (Polygon CDK, validium) |
| `eth_gasPrice` | **1 gwei** |
| `baseFeePerGas` in block header | **present, 0x7 (7 wei)**. Headers are London-style, but we still send **legacy (type 0)** txs as the kit recommends. The probe deploy was type 0 and succeeded |
| Block gas limit | 30,000,000 |
| `eth_getLogs` range | Error text: `block range too large, max range: 1000`. **`toBlock − fromBlock ≤ 1000` is accepted (1,001 blocks inclusive)**; a 2,000-block span fails. We chunk at **1,000 blocks** (safe either way) |
| Multicall3 `0xcA11…CA11` | code present (3,808 bytes) |
| Deployer `0x23aF…D3AC` | **9.9999 tQDAY**, nonce 1 before the probe |
| Deployer tUSD8 | **2.000000** (2,000,000 units). The prompt assumed ~3, and the demo budget needs ≈ 2.81. **See OPEN_QUESTIONS.md Q1** |

## tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483`
| Check | Result |
|---|---|
| `name / symbol / decimals / version` | `tUSD8` / `tUSD8` / `6` / `"2"` |
| `DOMAIN_SEPARATOR()` | `0x7838e6c46f8f9874236c9747d9896552a03d22c7c3e701b198879de2cb658022`, which **equals** `keccak256(abi.encode(EIP712Domain typehash, keccak("tUSD8"), keccak("2"), 44005, token))` (recomputed with cast) |
| Proxy? | **Yes, a USDC `FiatTokenProxy`.** The EIP-1967 slot is empty; the zos slot `0x7050c9e0…f8c3` holds implementation **`0xd6be708f41b07b2f4a7b48889b8e16626e317597`** (19,824 bytes) |
| `permit(owner,spender,value,deadline,v,r,s)` | present |
| `permit(…, bytes signature)` | present (FiatToken v2.2 style) |
| `transferWithAuthorization(… v,r,s)` | present |
| `receiveWithAuthorization(… v,r,s)` | present |
| `receiveWithAuthorization(… bytes signature)` | **present**: FiatToken v2.2 `SignatureChecker`, so EIP-3009/2612 **accept ERC-1271 signatures** from contract wallets via the `bytes` overloads |
| `authorizationState`, `cancelAuthorization`, `nonces` | present |
| `isBlacklisted`, `paused()` | present; `paused() == false` |
| Fork mint path | master minter `0x4d4b7031D35B74215bebe33F6AF6e682Ea99d0b1` (from the kit Makefile). Fork only |

ERC-1271 detail: detected via function selectors in the implementation bytecode. The source isn't verified on Blockscout; the bytes-signature overloads exist only in FiatToken v2.2, whose `SignatureChecker.isValidSignatureNow` covers ECDSA and ERC-1271.

## Shanghai bytecode probe (real tx)
- Contract `ShanghaiProbe` (`script/Probe.s.sol`) at **`0xF9b1b557584fB9A3DAdE63ABC2327CF594fC6880`**
- Deploy tx **`0x70ee89f659464d34b2695cfd44eb030276c7c61246d276791b83ad1cd57fefd1`**, block 3,748,576, type 0x0, gas used 124,283 (≈ 0.000124 tQDAY)
- `probe(digest, v, r, s)` returned `chainId = 44005`, `signer` = the throwaway key's address (ecrecover OK), `zero = 0` (PUSH0 OK; solc emitted 0x5f in the runtime code)
