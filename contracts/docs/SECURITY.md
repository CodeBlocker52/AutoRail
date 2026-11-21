# Security notes

Testnet software. **Unaudited.** tUSD8 and tQDAY have no monetary value.

## Trust model

| Actor | Can | Cannot |
|---|---|---|
| **Admin** (Ownable2Step owner, the deployer) | Wire contracts (`setFacility`, `setRouter`, `setWiring`), assign roles and buyer tiers, set overdue/default periods, pause the vault, facility and router, upgrade the ERC-8004 proxies | Move lender or JobWallet funds directly. **Trusted**: a malicious admin could rewire to a hostile facility. No timelock on testnet (roadmap) |
| **Underwriter** (agent with the Underwriter role) | Sign EIP-712 offers | Exceed RiskPricing caps (max advance %, fee floor, seller limit); each offer nonce is single-use; offers expire; the payee list is bound into the signature |
| **Seller** (creator of the receivable, JobWallet owner) | Create invoices, accept offers, grant and revoke sessions, pay **approved** payees | Pay itself or anyone unapproved (`PayeeNotAllowed`), fund an unconfirmed invoice (`NotConfirmed`), invoice itself (`SelfDealing`), reuse an invoice (`DuplicateInvoice`), exceed its credit limit |
| **Buyer** (lab agent) | Confirm (EIP-712, payee must be the router) and pay | Redirect payment: the confirmation names the router, and the EIP-3009 nonce is bound to router + receivable |
| **Payout agent** (session key) | Pay within the session | Exceed the per-payment or total cap, pay after expiry or revoke, pay unapproved payees. Every check is in `JobWallet.pay` |
| **Relayer** | Submit the buyer's signed payment, paying the gas | Change amount, payer, payee or receivable (all signed or checked); it spends only its own gas |
| **Anyone** | `markOverdue` / `markDefault` after the deadlines; submit confirmations and payments | Anything else |
| **Lenders** | Deposit and withdraw idle liquidity | Withdraw money that is out on advances (capped at idle). They bear default risk via `writeOff` |

## Invariants (tested)

| Invariant | Where |
|---|---|
| `totalAssets == tUSD8.balanceOf(vault) + outstandingPrincipal` | `invariant_totalAssetsIsIdlePlusOutstanding` |
| Vault outstanding == facility's per-seller book | `invariant_outstandingMatchesFacilityBook` |
| Session `spent ≤ totalCap`; every payment ≤ `perTxCap` | `invariant_sessionSpentWithinTotalCap`, `testFuzz_sessionCapsHold` |
| No receivable is repaid twice | `invariant_noDoubleRepayment`, `test_secondPaymentReverts_AlreadyRepaid` |
| Share price only falls on a write-off | `invariant_sharePriceOnlyDropsOnWriteOff` |
| Router and facility hold no tUSD8 between txs | `invariant_routerAndFacilityHoldNothing` |
| Waterfall conserves every unit (buyer paid = vault + seller − swept, no mint or burn) | `testFuzz_waterfallConservesEveryUnit` |
| Pricing is bounded and monotone in buyer tier | `testFuzz_bandsAreBoundedAndConsistent` |

Tests keep time in a storage `clock` (never a `block.timestamp`-derived local across `vm.warp`), so they don't depend on optimizer choices. Invariant runs: 128 × depth 64 (8,192 calls) by default; `FOUNDRY_PROFILE=ci` raises fuzz runs to 5,000.

## Signature security (tested)

- **Replay:** confirmation nonces per buyer (`Nonces`); offer nonces per underwriter; EIP-3009 nonces consumed by tUSD8.
- **Cross-chain:** chain ID is in every EIP-712 domain (`test_confirm_wrongChainIdFails`).
- **Wrong payee:** `WrongPayee` unless the payee is the router (`test_confirm_wrongPayee`).
- **Expiry:** confirmation deadline (`SignatureExpired`), offer expiry (`OfferExpired`), EIP-3009 `validBefore`.
- **Wrong signer:** `InvalidSignature`, `NotBuyer`, `InvalidUnderwriter`; a tampered offer (payee swapped after signing) recovers a different signer.
- **EIP-3009 nonce not bound to the receivable:** `WrongNonce` (`test_nonceNotBoundToReceivableIsRejected`); a signature for invoice A can't pay invoice B.
- **ERC-1271 buyers** (contract wallets) are supported via `SigCheck`; a rejecting wallet fails (`test_confirm_erc1271BuyerWallet`).

## Reentrancy (tested)

Classic storage-based `ReentrancyGuard` (never the transient variant) on every money path: vault deposit, withdraw and lend; `JobWallet.pay` and `sweep`; router `pay`, `payWithAuthorization`; facility `fund` and `markDefault`. `test/Reentrancy.t.sol` deploys the whole system on a hostile hook token that re-enters during transfers:
a malicious payee re-entering `pay`, the token re-entering the router mid-repayment, re-entering a vault withdrawal, and re-entering `sweep`. All are blocked. State changes happen before funds move: `settleRepayment` marks the receivable Repaid before the waterfall.

## Static analysis

**Slither** is not installed in this environment, so it was **not run**. To run it: `pip install slither-analyzer && slither . --filter-paths "lib|test|script"`.

**`forge lint src`** (Foundry 1.9.0) was run instead. Findings on our code (the vendored ERC-8004 files are excluded from fixes) and their triage:

| Lint | Count | Triage |
|---|---|---|
| `unsafe-typecast` (uint128/uint64) | 6 | **Fixed** the only reachable case: invoice amounts are now bounded with `AmountTooLarge`, so advances and fees always fit uint128. The rest are `uint64(block.timestamp)` and a `uint128(wouldSpend)` that is already checked ≤ `totalCap` (uint128) |
| `reentrancy-no-eth` | 10 | External calls go only to our own wired contracts or tUSD8, every entry point is `nonReentrant`, and receivable state changes before funds move. No issue |
| `reentrancy-events` | 11 | Events after calls to trusted, wired contracts. Off-chain readers use tx receipts. Informational |
| `block-timestamp` | 8 | Deadlines, expiries and due dates measured in minutes to days; validator skew of seconds doesn't matter |
| `require-revert-in-loop` | 2 | Payee validation in `JobWallet` (≤ a handful of payees). Intended |
| `unused-return` | 1 | `isAgent` returns `(ok, agentId)`; only `ok` is needed in `fund` |
| `non-reentrant-not-first` | 1 | `onlyFacility` runs before `nonReentrant` on `lend`; both are cheap checks. No issue |

No medium or high findings remain open on our contracts.

## Shanghai safety

- `evm_version = "shanghai"` everywhere; our own contracts don't use `*Transient` OpenZeppelin contracts.
- OpenZeppelin 5.4's `SignatureChecker` imports `Bytes.sol`, which uses inline `mcopy`. solc rejects it under Shanghai, so `src/libraries/SigCheck.sol` replaces it (ECDSA + ERC-1271, same semantics).
- `make build` scans every bytecode with a reachability-aware checker. The kit's linear checker (`make check-shanghai-strict`) flags a `0x5c` byte inside a via-IR **data blob** in the official ERC-8004 IdentityRegistry. It isn't reachable from any JUMPDEST (proof in PROGRESS.md), and the tests execute under the Shanghai EVM.
- A probe contract (PUSH0, `ecrecover`, CHAINID) was deployed and called on Aevum: see `docs/reference/chain-probe.md`.

## Known limits

- The admin is a single EOA (no multisig or timelock) on testnet.
- The underwriter key is trusted to price within bounds; the bounds are enforced onchain.
- tUSD8 is a FiatToken: its issuer can blacklist or pause, which would freeze repayments or advances.
- Blocked agent attempts are mined reverted txs whose gas is paid by the agent key (intended for the demo's audit trail).
- `JobWallet` owners (sellers) can pay approved payees without a session. Payees are fixed by the underwriter's signed offer.
- The ERC-8004 registries are UUPS proxies owned by the admin (same model as the official deployment).
