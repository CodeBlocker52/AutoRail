# Deploying Autorail web to Vercel

Checklist for deploying `web/` against the live QDay Aevum testnet deployment (chain 44005).

## 1. Project settings

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Root Directory | `web` |
| Include files outside the Root Directory | **On** (default). `prebuild` runs `scripts/sync-deployments.mjs`, which reads `../contracts/deployments`. If it can't see `../contracts`, it keeps the committed `lib/autorail/generated/` output, so the build still works. |
| Install command | `pnpm install --frozen-lockfile` (auto-detected from `pnpm-lock.yaml`) |
| Build command | `pnpm build` (runs `prebuild` → sync, then `next build`) |
| Output | `.next` (default) |
| Node.js version | 22.x |
| Functions | API routes use the Node runtime. `/api/agents/payout` and `/api/demo/live` set `maxDuration = 60`: Aevum makes about 0.5 blocks/s, so a step can take 10–20 s. Check that your plan allows 60 s. |

Generated files must **not** include the local fork: never deploy a build made with `SYNC_INCLUDE_FORK=1`.

## 2. Environment variables

Set these for **Production** (and Preview if you want previews to work onchain).

### Public (inlined into the browser bundle: no secrets here)

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_AUTORAIL_MODE` | `onchain` | Default data source. Unset also means onchain; `mock` makes "Demo data" the default. Users can switch either way with the header toggle. |
| `NEXT_PUBLIC_AUTORAIL_CHAIN_ID` | `44005` | never `440050` on Vercel |
| `NEXT_PUBLIC_AEVUM_RPC_URL` | `https://rpc-test.qday.info` | optional (this is the default) |
| `NEXT_PUBLIC_DEPLOYED` | `true` | landing page says "live on Aevum testnet" |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | your WalletConnect Cloud id | optional; injected wallets work without it |
| `NEXT_PUBLIC_GITHUB_URL`, `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_FAUCET_URL` | links | optional |

### Server only: mark every one of these **Sensitive**

**Never prefix any of these with `NEXT_PUBLIC_`.** Server modules import `server-only`, so a client import fails the build, but a `NEXT_PUBLIC_` name would still be inlined into the browser bundle.

| Variable | Needed for | Notes |
|---|---|---|
| `UNDERWRITER_PRIVATE_KEY` | `/api/underwrite` (Vendor "Accept offer") | signs EIP-712 Offers; must be the owner/wallet of the ERC-8004 agent with the Underwriter role in `AutorailRoles` (agent #2) |
| `RELAYER_PRIVATE_KEY` | `/api/relay` (Lab gasless pay) | pays gas; keep ≥ 0.01 tQDAY |
| `PAYOUT_SESSION_PRIVATE_KEY` | `/api/agents/payout`, "Run live" | the payout agent's session key |
| `LENDER_PRIVATE_KEY` | "Run live" only | needs ≥ 0.08 tUSD8 per run |
| `SELLER_PRIVATE_KEY` | "Run live" only | owner of ERC-8004 agent #0 |
| `BUYER_PRIVATE_KEY` | Frontier Lab: auto-confirm (`/api/lab/confirm`), **auto-pay** (`/api/lab/settle`), "Run live" | the **lab treasury**: keeps `LAB_TREASURY_RESERVE` (0.10) for Run live; every auto-pay spends the invoice amount (≤ 0.10). Top up with `pnpm ops:topup`. |
| `ROLES_OPERATOR_PRIVATE_KEY` | `/api/onboard` | owns **only** `AutorailRoles` (see `docs/ROLES_OPERATOR.md`); keep ≥ 0.005 tQDAY |
| `DRIP_PRIVATE_KEY` | `/api/drip` | 0.02 tQDAY per new wallet; keep ≥ 0.04 tQDAY |
| `CRON_SECRET` | Vercel Cron → `GET /api/lab/settle` | any random string; Vercel sends it as `Authorization: Bearer …` so the cron sweep skips the rate limit |
| `KV_REST_API_URL` | all routes | Upstash Redis REST URL (added automatically by the Vercel KV / Upstash integration) |
| `KV_REST_API_TOKEN` | all routes | Upstash REST token |
| `AUTORAIL_RPC_URL` | optional | server-side RPC override |

### Server only, not secret: caps, reserves and the kill switch

Plain (non-sensitive) server variables; all optional, defaults shown. Every cap is per UTC day unless noted; current usage and remaining counts are in `/api/health` → `limits`.

| Variable | Default | What |
|---|---|---|
| `DEMO_PAUSED` | `false` | `true` → every spending route (onboard, drip, lab confirm/settle, relay, payout agent, Run live) answers 503 "The live demo is paused…"; reads keep working |
| `CAP_ONBOARD_DAILY` | `40` | role assignments by `/api/onboard` |
| `CAP_DRIP_DAILY` | `25` | gas drips (also 3 per IP per day) |
| `CAP_AUTOCONFIRM_DAILY` | `30` | Frontier Lab auto-confirms |
| `CAP_AUTOPAY_DAILY` | `10` | Frontier Lab auto-pays, all vendors |
| `CAP_AUTOPAY_VENDOR_DAILY` | `2` | auto-pays per vendor agent |
| `CAP_RUNLIVE_DAILY` | `6` | "Run live" cycles |
| `CAP_RUNLIVE_IP_HOURLY` | `1` | "Run live" starts per IP per hour |
| `AUTOPAY_DELAY_SECONDS` | `60` | wait after funding before Frontier Lab pays |
| `LAB_TREASURY_RESERVE` | `100000` | tUSD8 units (0.10) the lab treasury never spends on auto-pay |
| `LIQUIDITY_RESERVE` | `75000` | tUSD8 units (0.075) of vault idle liquidity onboarded vendors can't advance against |

Changing any of these needs a redeploy (or "Redeploy" without changes) to take effect.

Leave out the "Run live" keys to disable live runs: preflight then reports "key isn't configured", and the Recorded run still works. The KV pair is required on Vercel: without it each serverless instance keeps its own in-memory idempotency keys and rate limits (see "Shared store" in `web/docs/UI.md`).

Don't set `UPSTASH_REDIS_REST_URL` / `_TOKEN` as well as the `KV_` pair: `KV_` takes precedence.

## 3. Before you deploy

- [ ] `cd web && pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass locally.
- [ ] `git grep -nE "NEXT_PUBLIC_[A-Z_]*(KEY|SECRET|TOKEN)"` returns nothing.
- [ ] `cd web && pnpm ops:topup` (dry run) shows every server wallet at target; if not, `pnpm ops:topup --execute` (locally, deployer key).
- [ ] The role accounts have tQDAY for gas (relayer and payout agent at least), checked with `POST /api/demo/live {"action":"preflight"}` locally.

## 4. Post-deploy smoke checks

Replace `$APP` with the deployment URL.

```bash
# 0. Health: mode onchain, KV ok, onboarding on, every wallet above its threshold
curl -s $APP/api/health | jq '{status, mode, kv, features, rolesOperatorOwnsRoles, warnings}'
#    → status "ok", mode "onchain", kv.ok true, all features true, rolesOperatorOwnsRoles true, warnings []
curl -s $APP/api/health | jq '{paused, limits: .limits.caps, reserves}'
#    → paused false; autoPay 10/day; reserves.autoPaysFundedByTreasury ≥ 1

# 0b. Auto-pay sweep answers (nothing due is fine)
curl -s $APP/api/lab/settle                 # → {"checked":N,"paid":0,"results":[…]}

# 1. Relayer is configured (address only, never the key)
curl -s $APP/api/relay                      # → {"enabled":true,"relayer":"0x4355…6E26"}

# 2. Latest real repayment (drives the landing proof strip)
curl -s $APP/api/proof                      # → {"receivableId":"0x…","txHash":"0x…","feedback":{"agentId":0,"value":"100"},…}

# 3. x402 merchant answers 402 without payment
curl -s -o /dev/null -w "%{http_code}\n" -X POST $APP/api/merchant/gpu   # → 402

# 4. Live-run preflight (read-only: balances, gas, vault liquidity)
curl -s -X POST $APP/api/demo/live -H 'content-type: application/json' -d '{"action":"preflight"}'
#    → {"ok":true,…} or a clear list of problems such as "Not enough tUSD8: …"

# 5. Rate limiting works across instances (needs KV): the 11th call in a minute is refused
for i in $(seq 1 11); do curl -s -o /dev/null -w "%{http_code} " -X POST $APP/api/relay -H 'content-type: application/json' -d '{}'; done; echo
#    → ten 400s (malformed body), then 429

# 6. No server secrets in the client bundle
curl -s $APP/ | grep -oE '/_next/static/chunks/[^"]+\.js' | sort -u | while read c; do curl -s "$APP$c"; done | grep -ciE "PRIVATE_KEY|KV_REST_API_TOKEN"   # → 0
```

In a browser:

- [ ] `/`: the hero pill reads "Chain 44005 · live on Aevum testnet"; the proof strip shows the latest settlement and its tx link opens `explorer-test.qday.info`.
- [ ] `/app/agents`: agents #0–#4 with owners; the Demo runner defaults to **Recorded run**, and "Replay" walks 1 → 12 (with 7a–7c, 10a/10b) with explorer links. Presenter mode works.
- [ ] `/app/audit`: real events and the three blocked attempts (PayeeNotAllowed, OverPerTxCap, SessionRevoked), grouped by day.
- [ ] Connect a wallet on the wrong chain: the "Switch network" banner appears and writes are refused.
- [ ] Optional, spends about 0.18 tUSD8 of demo funds: **Run live** completes 15/15.

## 5. Rollback

Promote the previous deployment in Vercel. No onchain state depends on the web deployment. If a key leaked, rotate it onchain first (underwriter: move the Underwriter role in `AutorailRoles` to a new agent; payout session: revoke the session in each JobWallet), then update the Sensitive variable and redeploy.
