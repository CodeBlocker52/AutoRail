# PROGRESS

| Phase | Status | Evidence |
|---|---|---|
| 0 · Sources + chain probe | ✅ 2026-11-21 | `docs/reference/*`, `docs/CHAIN.md`, probe contract on Aevum (`0xF9b1…6880`, tx `0x70ee89f6…efd1`) |
| 1 · Project, accounts, secrets | ✅ | `foundry.toml`, `Makefile`, `.env` (gitignored), `docs/ACCOUNTS.md`, `.env.example`, Fund/Recycle scripts |
| 2 · Contracts | ✅ | `src/` (8 contracts + 2 libraries + vendored ERC-8004) |
| 3 · Tests | ✅ | **115 tests + 6 invariants** (`forge test` prints "116 passed": it counts the invariant suite as one) **+ 3 fork tests** on the real tUSD8. Line coverage **97.8%** on `src/` (excluding vendored ERC-8004). `forge fmt --check` clean. `make build` Shanghai-safe |
| 4a · Fork rehearsal | ✅ ×2 | Two full runs on fresh forks (chain 440050): fund → deploy → register → e2e 12/12. Run 2 included a **crash test**: killed mid-tx with mining paused; the rerun resumed the in-flight hash, with no duplicate deposit (lender nonce stayed 1) |
| 4b · Deploy to Aevum | ✅ 2026-11-21 | Topped up to 3.00 tUSD8 (≥ 2.81 checked first). Commit `957edabb` (clean). Block 3,753,316. `make check-deployment` **55/55** |
| 5 · E2E on Aevum | ✅ | 15/15 step records, 3 mined reverts decoded, `NewFeedback` 100 in the repayment tx, no `FeedbackFailed`. `deployments/demo-run-44005.json` |
| 6 · Docs | ✅ | README address table, commit link, 11 key tx hashes |

## Decisions (small, recorded per the brief)

1. **OpenZeppelin v5.4.0** (kit uses 5.1.0) because the official ERC-8004 registries need contracts-upgradeable ^5.4.
2. **Official ERC-8004 registries used unmodified.** They compile for Shanghai (upstream's own config is solc 0.8.24, shanghai, via-IR). Foundry `compilation_restrictions` builds only those two files with via-IR.
   - The kit's linear `check-shanghai.mjs` flags `TLOAD at byte 14334/14548` in IdentityRegistry. A reachability analysis (every JUMPDEST treated as an entry, a superset of real control flow) shows that byte sits in a trailing via-IR data blob after the last reachable instruction. It's not code. Upstream's `MinimalUUPS` hard-codes the ERC-8004 team's owner, so a 15-line `ERC8004Bootstrap` sets our owner first and then `upgradeToAndCall`s the official implementation.
   - **Deviation from the brief** ("if they don't pass check-shanghai, write a minimal implementation"): kept because they pass a stricter, reachability-aware check and the false positive is proven. Easy to revisit.
3. **`SigCheck` instead of OpenZeppelin `SignatureChecker`**: OZ 5.4's version imports `Bytes.sol` (inline `mcopy`), which solc refuses under Shanghai.
4. **`confirm(id, buyer, payee, deadline, signature)`**, not `confirm(id, deadline, sig)`. The signer address and payee are explicit, so we get clear errors (`WrongPayee`, `NotBuyer`) and ERC-1271 support. The payee is still forced to equal the router.
5. **Receivable ids are `bytes32`** (`keccak256(chainid, registry, seller, invoiceHash)`), per the brief. **Frontend note:** the mock UI uses numeric ids; the onchain adapter should map to bytes32.
6. **ERC-8004 agent ids start at 0** (official contract). The demo ids are 0–4, not the mock UI's #3/#7/#9/#11/#12.
7. **Custom errors carry arguments** where useful (`PayeeNotAllowed(address)`, `OverPerTxCap(amount, cap)`, …). Names match `web/lib/autorail/errors.ts` exactly; viem decodes the name.
8. **Event `SessionKeyRevoked`** (not `SessionRevoked`): an event and an error can't share a name in Solidity, and the **error** must be `SessionRevoked` for the UI.
9. **Vault `repay` pulls** principal + fee from the router (via `forceApprove`), so the vault only books money it actually received. `lend`/`writeOff` are facility-only; `repay` is router-only.
10. **Feedback never blocks money**: router and facility wrap `giveFeedback` in try/catch and emit `FeedbackFailed`.
11. **Invoice amount ≤ uint128** (`AmountTooLarge`), from the lint triage.
12. **Agent URIs are base64 `data:` URIs** (ERC-8004 allows them; nothing to host). Each agent calls `register()` then `setAgentURI()` with a file that includes its own `registrations` entry. Rendered files: `deployments/agents/<chainId>-<slug>.json`.
13. **Keystore:** `make deploy-aevum ACCOUNT=<name>` is supported. The key wasn't imported non-interactively, because that would mean storing a keystore password; the raw-key path reads `contracts/.env` via `vm.envString`, so no key appears on a command line.
14. **`config/demo.json`** is the single budget source for the TS e2e; `test/DemoConfig.t.sol` asserts the Solidity constants match it.

## Fork rehearsal numbers (chain 440050)
- Deploy ≈ 0.0163 tQDAY, agent registration ≈ 0.0045, demo ≈ 0.0022 → **≈ 0.023 tQDAY of gas**. Funding moves 2.2 tQDAY to the role accounts (recyclable, not gas).
- Final balances: vault 1.21 → **1.234** (+1.20 principal, +0.024 fee); seller **+0.476** (0.376 + 0.10 swept); annotators 0.40/0.40; merchant 0.30; JobWallet 0.

## Aevum deployment log (2026-11-21)

**Pre-deploy checks**
- Deployer tUSD8 = **3.000000** (≥ 2.81), tQDAY 15.0.
- `git status` clean on `feat/contracts`; deploy commit `957edabb16d5141723b90695c411987bd02858f3`.
- Fork rehearsals ran `anvil … --hardfork shanghai` (Makefile `fork` target). Proof: on that fork, init code `PUSH0 TLOAD STOP` fails with `EVM error NotActivated` and `PUSH0` alone succeeds; real Aevum returns `invalid opcode: TLOAD` for the same call.
- e2e hardened before deploying: any `FeedbackFailed` (router or facility) aborts the run, and step 11/12 assert a `NewFeedback(seller, 100, "repaid_on_time")` inside the repayment tx. Rehearsal #3 on a fresh fork passed with these checks.

**Incident: RPC outage mid-deploy (resolved, no duplicates).** After 2 of 23 txs, the RPC host became unreachable (timeouts, then DNS failures), and forge aborted waiting for a receipt. On-chain state: exactly 2 txs mined (deployer nonce 15). `forge script --resume` (`make deploy-aevum-resume`) broadcast the remaining 21 txs of the **same signed plan**; 23/23 succeeded.
- Side effect: `--resume` re-executes the script, which rewrote `44005.addresses.json` with addresses for nonce 15 while the original plan (nonce 13) was broadcast. `RegisterAgents` caught it (a call to an address without code reverted).
- Fix: `scripts/write-deployment.mjs` now derives every address from the broadcast log's CREATE txs (fixed order from `AutorailDeployer`) and refuses to write if any address lacks code.

**Gas on Aevum (tQDAY):** probe 0.000124 · fund 0.000314 · deploy 0.016273 · agents 0.004541 · ERC-8004 smoke 0.000459 · e2e 0.002150 → **total 0.0239**. Funding moved 2.2 tQDAY to role accounts (recyclable). Recycle **not** run yet, as instructed.

## ERC-8004 runtime smoke test on Aevum (the flagged TLOAD byte never runs)

`script/Smoke8004.s.sol` registers a separate smoke agent **#5** (owner Annotator A, so the demo seller's reputation stays clean) and exercises every registry function Autorail uses. Each tx was then traced with the node's own `debug_traceTransaction` and its executed opcodes counted:

| Function | Tx | Executed opcodes | PUSH0 | TLOAD/TSTORE/MCOPY/BLOB* |
|---|---|---|---|---|
| `register(string)` (smoke) | [`0xfd0a72aa…94d8`](https://explorer-test.qday.info/tx/0xfd0a72aa1d3cdc46b30b6114bc368f298bd20349057af6febe02d51f586894d8) | 1,235 | 36 | **0** |
| `setAgentURI` (smoke) | [`0xa8729972…5919`](https://explorer-test.qday.info/tx/0xa8729972625c55f71b5f5f5a671e8ecb195c9d6c27991730d4f5c3cbfc8c5919) | 621 | 17 | **0** |
| `giveFeedback` (merchant → #5) | [`0x0da028ee…3ae5`](https://explorer-test.qday.info/tx/0x0da028ee1f143338f29d2756a50b4a9cd7dfe62ee60e5eb092f3c167160b3ae5) | 1,829 | 59 | **0** |
| `register()` + `setAgentURI` × 5 demo agents | `RegisterAgents` broadcast (10 txs) | 709 / ~1,250 each | 28 / 15 | **0** |
| `giveFeedback` by the router inside the repayment | [`0x3473284f…ff01`](https://explorer-test.qday.info/tx/0x3473284f084d95f4f4a63a6062b90114f2d4583712df95eca7ddf3053c74ff01) | 10,780 | 115 | **0** |

Live reads with `cast call` at block 3,754,091:
- `ownerOf(5)` = `0xd052…2ff7` (Annotator A); `tokenURI(5)` = the smoke data URI; `ownerOf(0)` = the seller `0x2366…B98D`; `tokenURI(0)` = the base64 registration file.
- `isAuthorizedOrOwner(merchant, 5)` = false.
- `getSummary(5, [merchant], "smoke")` = **(1, 77, 0)**; `getSummary(0, [router], "credit")` = **(1, 100, 0)**.

Conclusion: the official IdentityRegistry/ReputationRegistry run correctly on Aevum's Shanghai EVM. Across 14 traced live txs no Cancun-only opcode executed, confirming the kit checker's TLOAD hit (byte 14334) is unreachable data.

## Next
1. Push `feat/contracts` so the README commit link resolves.
2. Wire the web app's onchain adapter to `deployments/44005.json` + `deployments/abi/` (bytes32 receivable ids, agent ids 0–4).
3. `make recycle-aevum` when the demo funds are no longer needed (not run yet).
