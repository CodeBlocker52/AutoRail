# Autorail UI

Next.js 15 (App Router) · TypeScript · Tailwind 3 · framer-motion · wagmi v2 + viem + RainbowKit · Recharts.
Everything lives in `web/`.

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production build (zero type errors)
pnpm lint
pnpm smoke        # runs the 12 demo steps + edge cases against the mock client
```

## Routes

| Route | What it is |
|---|---|
| `/` | Landing page: hero, cash gap, solutions grid, 5 feature deep-dives (with the right-edge section rail), how it works, lenders, safety, CTA, footer |
| `/app` | Overview: vault/outstanding/repaid/defaults/active-session stats, recent activity, demo card, invoices |
| `/app/lend` | Lender: deposit with permit, withdraw, position, utilisation chart, vault totals, active advances |
| `/app/vendor` | Vendor: register ERC-8004 agent, create invoice (file hashed in browser), invoices table, advance offer |
| `/app/invoices/[id]` | Invoice detail: state stepper, parties, JobWallet + budget lines, session key manager, "send a payment" (try the limits), payments, waterfall, audit timeline |
| `/app/lab` | Lab: confirm (EIP-712 in plain English + raw toggle), pay (EIP-3009, gasless) → resulting waterfall |
| `/app/agents` | Agents console: 5 agent cards, demo runner (12 steps), live event log |
| `/app/audit` | Filterable event timeline (invoice / agent / type), explorer links, reputation chart per agent. Accepts `?invoice=<id>` |
| `/design` | Tokens, type, and every component, for review |

The role switcher (Lender / Vendor / Lab / Agents) in the top bar sets the acting wallet in mock mode and jumps to that role's screen.

## Demo-day features

- **Presenter mode:** the *Present* button in the Demo runner (`/app/agents`). Keys: `→` runs the next step (or catches up if you went back), `←` previous step, `R` reset to step 0, `Esc` exit. Blocked steps flash a red outline with the plain-English reason; successes show a check and explorer links.
- **Transaction toasts:** bottom-right, for every write (`useTx(label)`) and every demo step. Stages: awaiting signature → pending → confirmed / reverted.
- **Testnet banner:** top of the app, dismissible per browser session.
- **Acting-as chip:** mock mode only. Shows which agent the selected role acts as, next to the wallet button.
- **Landing proof strip:** the latest `invoice.repaid` event (`lib/autorail/proof.ts`). In mock mode it comes from a separate, fully-played demo run and is tagged "demo data".
- **`NEXT_PUBLIC_DEPLOYED`:** set it to `true` once contracts are live. Until then the hero pill reads "Chain 44005 · Aevum testnet" without "live".

## Data flow

```
UI components ──► hooks/ (react-query) ──► AutorailClient (lib/autorail/client.ts)
                                              ├── MockAutorailClient    lib/autorail/mock.ts
                                              └── OnchainAutorailClient lib/autorail/onchain.ts
```

- **The UI only talks to hooks; hooks only talk to `AutorailClient`.** No component imports `mock.ts` or `onchain.ts`.
- Amounts are `bigint` with 6 decimals everywhere; format with `formatAmount` / `<Amount>` at display time.
- Every write goes through `useTx()` → `<TxStatus>` (awaiting signature → pending → confirmed / failed) and `<ErrorBanner>`.
- Errors are decoded by `decodeError()` in `lib/autorail/errors.ts`, which maps custom-error names (`PayeeNotAllowed`, `OverPerTxCap`, …) to plain English. **Keep the contract custom-error names identical to those codes.**
- Mock mode: the client emits a change event after each write; `Providers` invalidates all `["autorail", …]` queries.
- Onchain mode: queries poll every 4 s (`POLL_INTERVAL_MS`). No WebSockets.

## Switching mock → onchain

1. Deploy the contracts, then set the addresses in `.env.local` (see `.env.example`):
   `NEXT_PUBLIC_VAULT_ADDRESS`, `…RECEIVABLE_REGISTRY…`, `…CREDIT_FACILITY…`, `…JOB_WALLET_FACTORY…`, `…REPAYMENT_ROUTER…`, `…IDENTITY_REGISTRY…`, `…REPUTATION_REGISTRY…`.
2. Paste each compiled ABI into `lib/abi/<Contract>.ts` (keep the `as const`).
3. Fill in the `TODO(onchain)` methods in `lib/autorail/onchain.ts`. `getBalances` already reads real tUSD8 and tQDAY.
   - Read logs in ≤ 1,000-block chunks (`LOG_CHUNK_SIZE`).
   - Writes get the wallet from `setWalletClient()` (wired in `Providers`). Use legacy txs if Aevum rejects EIP-1559.
   - Blocked payment attempts don't emit events. Source them from the payout agent's log, or simulate with `simulateContract` and record the revert.
4. Set `NEXT_PUBLIC_AUTORAIL_MODE=onchain` and restart.

## Mock scenario

Presets: `fresh` (before step 1), `scenario` (default: steps 1–10 + INV-002), `complete` (all 12 steps; used by the landing proof strip). `MockAutorailClient` seeds the README demo. On load it runs steps 1–10 (vault 6.00, Lumen Data #12, INV-001 4.00 funded 75% / 2%, session, 3 payments, 3 blocked attempts) and creates INV-002 (2.50, awaiting the lab). The demo runner can **Reset to step 0** to rehearse all 12 steps, or **Load scenario** to return to that seeded state. State is in memory and resets on page reload.

## Components

`components/ui/`: Logo, GridBackdrop, SectionRail, Eyebrow, StatPill, DiagramCard, Button/ButtonLink, Card/CardHeader/StatCard, Modal, Tabs, Badge/StateBadge, AddressChip/TxHashLink, Amount, TokenInput, TxStatus, ErrorBanner, StepTimeline, WaterfallBar, SpendCapBar, EmptyState, Skeleton, Table, Reveal.

`components/autorail/`: NetworkGuard, FaucetHint, SessionKeyCard, GrantSessionModal, TypedDataReview, AgentCard, EventLog, DemoRunner, InvoicesTable, AdvanceOfferCard, Charts (VaultUtilisationChart, ReputationChart).

`components/diagrams/`: HubDiagram (ok/blocked spokes), CashGap, InvoiceAdvance, ScopedSpending, Waterfall, Reputation, X402, HowItWorks (4), VaultCardMock.

`components/landing/`: page sections. `components/app/`: Providers, AppShell, RoleSwitcher, views/.

## Tokens

Defined once as RGB channels in `app/globals.css` (`--bg`, `--brand`, …) and exposed in `tailwind.config.ts` as `bg-bg`, `text-ink`, `bg-brand-soft`, `border-line`, etc., so opacity modifiers like `bg-brand/10` work. Fonts come from `next/font`: Libre Baskerville (`font-serif`), IBM Plex Sans (`font-sans`), IBM Plex Mono (`font-mono`).
