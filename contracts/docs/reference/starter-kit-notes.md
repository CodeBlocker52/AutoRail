Source: https://github.com/qday-io/aevum-starter-kit at commit `e87bcff10fbaffcc920df658b2fdf79b4586b277` (2026-11-20)
Read: 2026-11-21 · Licence: MIT, Copyright (c) 2026 PQA Labs

# Aevum Starter Kit: what we reuse and how

| Kit file | What it does | How Autorail uses it |
|---|---|---|
| `contracts/foundry.toml` | solc 0.8.24, `evm_version = "shanghai"`, optimizer 200 | Same settings in `contracts/foundry.toml` |
| `.gitmodules` | forge-std v1.9.6, OpenZeppelin **v5.1.0** | We pin OpenZeppelin **v5.4.0** (contracts + contracts-upgradeable), because the official ERC-8004 registries need upgradeable ^5.4. forge-std v1.17.0 |
| `tools/check-shanghai.mjs` | Scans `src/` bytecode for BLOBHASH, BLOBBASEFEE, TLOAD, TSTORE, MCOPY | **Copied unchanged** to `contracts/tools/`, with a credit line. Runs in `make build` |
| `Makefile` | `fork` = anvil `--fork-url` + `--hardfork shanghai` + chain **440050** on port **8555**; `deal` mints real tUSD8 on the fork by impersonating the master minter `0x4d4b…d0b1` and calling `configureMinter` + `mint`; `deploy-fork` deploys from a random impersonated address | Same approach in our `Makefile` (`fork`, `deal`, `deploy-fork`) |
| `contracts/src/Checkout.sol` | EIP-3009 `receiveWithAuthorization` with `to == address(this)`; nonce `authorizationNonce(orderId) = keccak256(abi.encode(address(this), orderId))`; any amount (the app must check the price) | **Pattern reused** in `RepaymentRouter.payWithAuthorization`: the receivable-bound nonce `keccak256(abi.encode(address(this), id))`. We also enforce `value == invoice amount` onchain, which fixes the kit's "any amount" limitation |
| `contracts/src/mocks/MockUSD8.sol` | ERC20 + EIP712("tUSD8","2"), EIP-3009 transfer/receive, `to == msg.sender` rule for receive, `authorizationState`, custom errors | **Base of `test/mocks/MockTUSD8.sol`** (credited). We add **EIP-2612 `permit`**, which the kit mock lacks and the real token has |
| `contracts/test/Signing.sol` | Builds `ReceiveWithAuthorization` digests for `vm.sign` | Same idea in `test/utils/Sigs.sol`, extended for permit and our EIP-712 types |
| `contracts/test/fork/AevumFork.t.sol` | Asserts the real tUSD8 DOMAIN_SEPARATOR; `deal` + real `receiveWithAuthorization` | Same checks in `test/fork/RealTusd8.t.sol`, against our contracts |
| `contracts/script/Deploy.s.sol` | Refuses public anvil accounts as recipients outside local chains | Same guard in `Deploy.s.sol` |
| `packages/aevum/src/*` (`@aevum-kit/aevum`) | `aevumTestnet`/`aevumFork` chains, `tusd8Domain`, `receiveWithAuthorizationTypes`, `authorizationWindow`, `getLogsChunked` (≤1,000 blocks) | **Vendored** into `contracts/scripts/e2e/aevum-kit/` with the MIT notice (it's a private workspace package, not on npm) |
| `examples/src/pay-gasless.ts` | Buyer signs, relayer simulates and then sends `type: "legacy"` | Same flow in step 11 of `scripts/e2e/run.ts` |
| `web/src/app/api/relay/route.ts` | Relayer rails: only our contract and function, only the order price, max 1h window, in-flight dedupe, already-paid check, simulate first, `nonceManager`, refuses anvil keys on real networks | Same rails in `scripts/e2e/relayer.ts` |

**Credit line used in our files:** "Based on Aevum Starter Kit (MIT, PQA Labs)". Their LICENSE text is reproduced in `contracts/NOTICE.md`.
