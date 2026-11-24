# M2 QA report: production config + real-user QA on Aevum

Date: 2026-11-22/23 · Branch `m2/qa` · Chain QDay Aevum testnet (44005) · Production https://autorail-qday.vercel.app

## Where things ran

| Target | What ran there | Why |
|---|---|---|
| **Local production build** (`next build && next start`, Aevum 44005, the production Upstash, all server keys) | API QA, the live cycle, the UI crawl, Lighthouse | Production still serves the M1 build in **mock mode with no server keys** (`/api/relay` → `enabled:false`, `/api/health` → 404). It needs the env vars + a redeploy from this branch (see the end). Same code, same chain and KV as production will have. |
| **Local fork** (anvil copy of Aevum, chain 440050) | Playwright UI: full cycle, failure drills, fresh-wallet onboarding | Wallet-driven browser tests with the fork-only test wallet; no real funds. |
| **Production URL** | Read-only crawl (baseline) | See "Production baseline". Rerun everything after the redeploy: `BASE=https://autorail-qday.vercel.app pnpm qa:crawl` and `… pnpm qa:api`. |

## Results

| Area | Result | Evidence |
|---|---|---|
| `/api/health` (no secrets, KV, wallets, features) | ✅ | `docs/qa/api-qa-2026-11-22.json` (health.1–2) |
| `/api/proof` → real router `Repaid` | ✅ | proof.1 |
| `/api/underwrite`: valid offer · unconfirmed rejected · non-seller can't use the offer (`NotSeller`) | ✅ ✅ ✅ | underwrite.1–3 |
| `/api/relay` rails: wrong amount · from ≠ buyer · wrong nonce · validBefore > 1 h · replay · already repaid → all **rejected**; valid → `Repaid` + `NewFeedback`, no `FeedbackFailed`; rate limit → 429 | ✅ ×9 | relay.1–9 |
| `/api/merchant/gpu`: 402 without payment · not served for a non-matching hash (402) · 200 after `Paid(memo = requestId)` · same payment again 409 · paid tx can't unlock another request id | ✅ ×5 | merchant.1–5 |
| `/api/agents/payout`: same idempotency key twice → one payment · injection line → mined `PayeeNotAllowed` · over-cap `OverPerTxCap` · after revoke `SessionRevoked` | ✅ ×7 | payout.1–7 |
| `/api/onboard`: only vendor/lab (400) · someone else's agent 403 · Seller / Buyer + tier 1 assigned onchain · idempotent · our agent #2 can't be re-roled · rate-limited | ✅ ×6 (1 ⚠️ see below) | onboard.* |
| `/api/drip`: no drip with gas · 0.02 once · second refused · daily per-IP limit (429 observed in run 2) | ✅ ×3 | drip.* |
| `/api/lab/confirm`: > 0.20 refused · auto-confirm of an onboarded vendor's 0.10 · idempotent | ✅ ×4 | labconfirm.* |
| **Full live cycle on Aevum through the API routes** (QA wallets, invoice 0.10) | ✅ | `docs/qa/live-cycle-2026-11-22.json` + table below |
| Fresh "judge" wallet: drip → register ERC-8004 agent → Seller (API, Aevum) | ✅ | onboard.QA_JUDGE |
| Fresh wallet onboarding **in the browser** + Frontier Lab auto-confirm (fork) | ✅ | `e2e/onboard.spec.ts` |
| Failure drills (fork): double-click deposit → 1 permit + 1 tx · double-click create → 1 invoice · wrong network → switch prompt, no wallet prompt · insufficient tUSD8 → message, button disabled · insufficient tQDAY → "Not enough tQDAY…" before signing · rejected signature → "You cancelled the signature." · pending tx survives navigation | ✅ ×7 | `e2e/drills.spec.ts` |
| M1 UI cycle (fork) | ✅ ×6 | `e2e/fork.spec.ts` |
| Unit tests | ✅ 25/25 | vitest |
| UI crawl (10 routes × 375/768/1440): console errors, failed requests, links/anchors, overflow, explorer links on 44005, proof strip | ✅ **0 issues** after fixes (first pass found 5 real ones: #10, #11, #14, #15 + a checker false positive) · Lighthouse mobile: `/` 96/100/100/100 · `/app` 74/100/100/100 | `docs/qa/crawl-localhost-3313-*.json` |
| CI on `m2/qa` | ✅ test · web · secrets (full-history gitleaks) | [run 45055331518](https://github.com/CodeBlocker52/AutoRail/actions/runs/45055331518) |

**API QA: 40/41.** The one ⚠️ is an over-specified assertion, not a bug: by the third run QA_LAB had used its per-wallet onboarding quota (3/h), so the "re-role our Underwriter #2" attempt got **429** instead of **403**. `roleOf(#2)` stayed Underwriter; run 2 showed the 403 `NotAgentOwner` path. The check now accepts 403 or 429 with the role unchanged.

### Live cycle (Aevum, via the API routes, QA wallets)

Vendor agent #6 (QA_VENDOR) → Lab agent #7 (QA_LAB), receivable `0x96d3cca6…dc51`, JobWallet `0x7a5edE3b…Ca46`.

| Step | Tx |
|---|---|
| QA_LENDER deposits with one permit | [0x72418a56…](https://explorer-test.qday.info/tx/0x72418a5660b0b836a06ff181a8a64806e84a52850fef37633d7bdd903368ac22) |
| Fresh judge wallet registers agent / `/api/onboard` → Seller | [0xf5a1707b…](https://explorer-test.qday.info/tx/0xf5a1707b79307471c836954a57c48b3d8b4cd5f072218a8f12be5fdee57896fb) · [0x475c8554…](https://explorer-test.qday.info/tx/0x475c85541534f0657823e259d49de384f5a490594d07d595ba3b3c83f9961006) |
| Vendor creates a 0.10 invoice to QA_LAB | [0x8c2e24c9…](https://explorer-test.qday.info/tx/0x8c2e24c9db90ecd62242341cc04140acad773dfd4e6af6020a84fddb76c3d984) |
| Lab confirms (EIP-712, payee = router) | [0x555fdcb7…](https://explorer-test.qday.info/tx/0x555fdcb7d6ff2e2415b23eeb24cbab557e43bf5f864c8c48fca92c2a6b212605) |
| `/api/underwrite` → signed Offer; vendor funds | [0xf82e8542…](https://explorer-test.qday.info/tx/0xf82e854202a321641a6e869012c64075f39f6b8a825bcdb2c25a15169ecdb22d) |
| Session for the payout agent (0.03 / payment, 0.07 total) | [0x23ffe8c2…](https://explorer-test.qday.info/tx/0x23ffe8c228c4a39c2a363f1f889beac81294cea66c9a97457e10e1fd239036ba) |
| Pays Annotator A 0.02 (idempotent) / Annotator B 0.02 | [0x862b29c5…](https://explorer-test.qday.info/tx/0x862b29c5f85e1e91645f168607bfde63f6f13d39cdc4ed23c62fcfa5d61427b8) · [0x04d4b94a…](https://explorer-test.qday.info/tx/0x04d4b94aa3f3c9c4e5421f055bd32109a8cb746c35aac8614ba83e1e53f8d36e) |
| x402: 402 → JobWallet pays the merchant (memo = requestId) → 200 | [0x698cc773…](https://explorer-test.qday.info/tx/0x698cc773c46c1aa2e383fe3375e65b3ef6f14f44a20bd698c241106a225ea6b7) |
| ❌ Prompt-injected payee → `PayeeNotAllowed` (mined revert) | [0xf7751dda…](https://explorer-test.qday.info/tx/0xf7751dda5d3195ec37c2639f7b74145a08fe7794bd08c4dba4506249f2cec059) |
| ❌ Over cap → `OverPerTxCap` | [0xca4939d3…](https://explorer-test.qday.info/tx/0xca4939d35e3a69709e0b156384db49dedd681a7646d0e1a7a2476af0c5b526fd) |
| Vendor revokes; ❌ retry → `SessionRevoked` | [0xc807dc62…](https://explorer-test.qday.info/tx/0xc807dc62b8c923092f60fe2090ea28e5f995a36b782d7a2e98473082f9e158f2) · [0xec88ffb0…](https://explorer-test.qday.info/tx/0xec88ffb0ce6f6863d40f69d69e9f6548433199aa2594f1bacd0c01250b288a04) |
| Lab pays gasless via `/api/relay`; lenders first; ERC-8004 feedback in the same tx | [0xdf95046d…](https://explorer-test.qday.info/tx/0xdf95046db609dc8f36f3d34245f5a7fa32c33f64e9f8f870a0584000f84038dc) |
| Final: invoice Repaid; `getSummary(#6)` = 1 feedback, average 100 | — |

## Production baseline (current deploy, before the redeploy)

`BASE=https://autorail-qday.vercel.app pnpm qa:crawl` → 10 issues, all fixed on this branch: `/app/onboard` 404 (new route, ×3 widths), `/design` hydration error #418 (×3), `/design` fake hash linked to the explorer. Proof strip already resolves to a real router `Repaid`. Lighthouse: `/` 95/100/100/100, `/app` 78/92/100/100 (92 → 100 with fixes #12 and #14). Details: `docs/qa/crawl-autorail-qday-vercel-app-2026-11-22.json`.

## Bugs found and fixed

| # | Bug | Fix | Commit |
|---|---|---|---|
| 1 | Onboarding answered "already onboarded" (200) for a request naming **someone else's** agent when the caller already had that role | ownership checked before the idempotent shortcut → 403 | [6675cf5](https://github.com/CodeBlocker52/AutoRail/commit/6675cf5) |
| 2 | x402 merchant: unknown tx hash → 500 | 402 `PaymentNotFound`; tx claimed only after validation | 6675cf5 |
| 3 | x402: the same request id could be served twice if paid twice | request id served once (`x402:done`) | 6675cf5 |
| 4 | Payout agent: after an RPC timeout, a retry with the same idempotency key reported the payment as "skipped" | the recorded hash is looked up onchain (paid / blocked / pending), never re-signed; "took too long" retried | 6675cf5 |
| 5 | Nonce manager was per serverless instance: two instances could reuse a relayer nonce | per-signer Upstash lock + stored next nonce | [cac2dee](https://github.com/CodeBlocker52/AutoRail/commit/cac2dee) |
| 6 | Drip: "you already have gas" answers used up the per-IP daily quota | only real drips count | 6675cf5 |
| 7 | Rate-limit buckets weren't chain-scoped: local dev / fork sharing the KV spent production's quotas | `rl:<chain>:…` | 6675cf5 |
| 8 | Wallet on the wrong chain: writes said "Connect a wallet first." | "Switch your wallet to QDay Aevum testnet (44005)." before any prompt | 6675cf5 |
| 9 | Two vendors' invoices with the same number/buyer/amount/date (no file) collided → "already submitted" | the seller is part of the hash | 6675cf5 |
| 10 | `/design`: React hydration error #418 at every width | rendered after mount | 6675cf5 |
| 11 | `/app/audit`: 155 px horizontal overflow at 768 px (screen-reader chart tables) | `sr-only` wrapper | 6675cf5 |
| 12 | a11y: toast container `aria-label` without a role | `role="region"` | 6675cf5 |
| 13 | Error banner printed "UNKNOWN" under API refusals | hidden / shows the API code | 6675cf5 |
| 14 | a11y: 11 px muted time on blocked (pink) rows at 4.48:1 contrast (`/app` accessibility 96) | darker text → `/app` accessibility **100** | [f7af510](https://github.com/CodeBlocker52/AutoRail/commit/f7af510) |
| 15 | `/design` (sample data) linked fake hashes to the Aevum explorer when Live was the default | `/design` is pinned to demo data (`<Providers forceMode="mock">`) | [f7af510](https://github.com/CodeBlocker52/AutoRail/commit/f7af510) |

## Known limits

- **Production isn't onchain yet**: it needs the env vars below and a redeploy from this branch (or after merging). Until then it serves M1 in mock mode.
- ~~A solo judge can't repay~~ **Closed in M2.5**: "Frontier Lab auto-pays" settles an onboarded vendor's Funded invoice to our lab (≤ 0.10 tUSD8) about 60 s after funding, capped at 10/day globally and 2/day per vendor. Each auto-paid invoice costs the lab treasury the invoice amount: the vault gets its principal back plus the fee, and the judge's vendor wallet ends up with the advance (if unspent) plus the remainder, ≈ the invoice amount minus the fee. The treasury (0.40 tUSD8 after the M2.5 top-up) keeps a 0.10 reserve for "Run live", so 3 auto-pays fit before `pnpm ops:topup` is needed; `/api/health` shows `reserves.autoPaysFundedByTreasury`.
- **Auto-pay timing on Vercel Hobby**: the Vendor screen drives the ~60 s auto-pay while it's open. If the vendor closes the tab, the safety-net sweep (`GET /api/lab/settle`) runs from Vercel Cron once a day on Hobby (Hobby only allows daily crons). On Pro, change `web/vercel.json` to `*/2 * * * *`. Any later visit to that invoice also triggers it.
- **Drip budget**: 1.0 tQDAY after the top-up = 50 drips; the daily cap (`CAP_DRIP_DAILY`, default 25) and 3 per IP per day apply.
- **Lighthouse `/app`** performance 74 (mobile): wagmi/RainbowKit and the live indexer on first load. Landing ≥ 95.
- **Rate limits are per IP**: judges behind one venue NAT share 5 onboardings/h, 3 drips/day and 1 "Run live"/h per IP. Global daily caps (`CAP_*`) bound total spend; `DEMO_PAUSED=true` stops every spending route.
- The QA scripts simulate one client IP per run (TEST-NET 203.0.113.x in `x-vercel-forwarded-for`) against the local server; Vercel overwrites that header in production.
- QA leftovers on Aevum: four unfunded QA invoices (INV-004/005/007/008: Created or Confirmed). Harmless; nothing is owed. The one funded leftover (INV-006 from the interrupted run 1) was repaid ([0xa3f6c71e…](https://explorer-test.qday.info/tx/0xa3f6c71e1c1d902ca288a7ae4c70cbbe16ed2971f3f5d3c24f8d26a08178c0cb)).

## Budget (from recycled demo balances, not the deployer)

| | Moved | Notes |
|---|---|---|
| **tQDAY** | **0.45** (limit 0.5) | underwriter → operator 0.03, drip 0.12, QA_LAB 0.1 · merchant → QA_LENDER 0.1, QA_VENDOR 0.1. Of that, 0.04 left via the drip (one to an unsaved throwaway wallet in run 1, one to QA_JUDGE); the rest is gas or still held. The deployer paid 0.000048 tQDAY for the one ownership tx. |
| **tUSD8** | **0.60** (limit 1.0) | Annotator A → QA_LENDER 0.3 · Annotator B → QA_LAB 0.3. Used: QA_LENDER deposited 0.25 (still its vault shares), QA_LAB repaid two 0.10 invoices (to the vault and QA_VENDOR). No tUSD8 left our demo/QA accounts. |

## Balances now (Aevum)

| Wallet | Address | tQDAY | tUSD8 | Role |
|---|---|---|---|---|
| DEPLOYER | `0x23aF…D3AC` | 10.7824 | 0.41 | admin (not on server) |
| UNDERWRITER | `0xbAf2…F7bE` | 0.0491 | 0 | server: signs offers (no gas needed) |
| RELAYER | `0x4355…6E26` | 0.2981 | 0 | server: gasless relay |
| LENDER | `0x4E79…b7e6` | 0.2996 | 0 | live demo |
| SELLER | `0x2366…B98D` | 0.2957 | 0.433375 | live demo |
| BUYER | `0x7e22…246b` | 0.2990 | 0 | server: Frontier Lab agent / live demo |
| PAYOUT_SESSION | `0xf6D2…5614` | 0.2975 | 0 | server: payout agent |
| MERCHANT | `0xe278…0f54` | 0.0989 | 0.36 | demo / QA |
| ANNOTATOR_A | `0xd052…2ff7` | 0.0497 | 0.19 | demo / QA |
| ANNOTATOR_B | `0xd7fC…5BB3` | 0.0499 | 0.19 | demo / QA |
| ROGUE | `0x3a01…e03f` | 0.0000 | 0 | demo / QA |
| ROLES_OPERATOR | `0x6e81…0D58` | 0.0297 | 0 | server: onboarding |
| DRIP | `0x635D…a37A` | 0.0800 | 0 | server: gas drip |
| QA_LENDER | `0xC032…0C01` | 0.0996 | 0.05 | demo / QA |
| QA_VENDOR | `0x3Cd8…7C00` | 0.0961 | 0.097 | demo / QA |
| QA_LAB | `0x59Fb…b10F` | 0.0993 | 0.1 | demo / QA |
| QA_JUDGE | `0x2dd8…f4a1` | 0.0196 | 0 | demo / QA |

## Ownership

`AutorailRoles` is owned by ROLES_OPERATOR `0x6e81…0D58` ([transfer](https://explorer-test.qday.info/tx/0x123fffad6a5488f5e42c903a4b9b787e19d33150899683a42e55c1396a10b800), [accept](https://explorer-test.qday.info/tx/0x20ed17bedd7a26532996f610971ce221ae435619dfbc6c9f49047042d598ff50)); everything else stays with the deployer. Transfer back: `docs/ROLES_OPERATOR.md`.
