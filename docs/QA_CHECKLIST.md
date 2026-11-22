# Manual QA checklist (MetaMask, about 30–45 min)

Production: **https://autorail-qday.vercel.app** · Chain **QDay Aevum testnet (44005)** · Explorer https://explorer-test.qday.info

Test wallets: import the burners from `docs/QA_KEYS_FOR_METAMASK.md` (git-ignored; also explains how to add the network and the tUSD8 token). Addresses are in `docs/QA_ACCOUNTS.md`.

| Wallet | Use it for | Starts with |
|---|---|---|
| QA_LENDER | Lend | ~0.2 tUSD8, ~0.1 tQDAY |
| QA_VENDOR | Vendor (already onboarded as a Seller) | ~0.1 tQDAY, 0 tUSD8 |
| QA_LAB | Lab (already onboarded as a Buyer, tier 1) | ~0.1 tUSD8, ~0.1 tQDAY |
| A brand-new MetaMask account | "Judge" onboarding | nothing |

Keep amounts tiny (0.05–0.10 tUSD8). Before you start, open `/api/health`: `status` should be `ok`, `kv.ok` true, and every wallet `low: false`.

For every step, fill in **Actual / screenshot / tx hash**. ✅ = matches the expected result.

---

## 0 · General (desktop)

| # | Step | Expected | Actual / screenshot / tx | ✅ |
|---|---|---|---|---|
| 0.1 | Open `/` | Hero loads; proof strip shows "Latest settlement · INV-… · tx · block"; the tx opens on explorer-test.qday.info and shows a RepaymentRouter `Repaid` | | ☐ |
| 0.2 | Click every nav link (How it works, Vendors, Lenders, Safety, Docs) | Each scrolls to its section or opens docs; no 404 | | ☐ |
| 0.3 | Open `/app` | Header shows **Live (Aevum)** selected; footer shows a green dot "All systems normal · block N" | | ☐ |
| 0.4 | Toggle **Demo data** | URL gets `?mode=demo`; yellow "Demo data" banner; numbers change to the demo scenario | | ☐ |
| 0.5 | Reload `/app/agents` without the param | Still demo (remembered) | | ☐ |
| 0.6 | Click **Switch to Live (Aevum)** | URL `?mode=live`; banner gone; real data | | ☐ |
| 0.7 | Connect MetaMask on another network (e.g. Ethereum) | "Switch network" banner; any write says "Switch your wallet to QDay Aevum testnet (44005)" | | ☐ |

## 1 · Lender (QA_LENDER)

| # | Step | Expected | Actual / screenshot / tx | ✅ |
|---|---|---|---|---|
| 1.1 | `/app/lend` → Deposit 0.05 | MetaMask asks for **one signature** (Permit), then **one transaction** (no separate approve) | | ☐ |
| 1.2 | Wait for "Confirmed" | Toast + status with tx link; "Your position" value increases by 0.05; Vault totals update | | ☐ |
| 1.3 | Double-click "Deposit with permit" quickly | Only one signature request / one tx | | ☐ |
| 1.4 | Enter more than your balance | Button disabled, or the plain-English message "This deposit needs X tUSD8; this wallet has Y" **before** any MetaMask popup | | ☐ |
| 1.5 | Start a deposit, reject in MetaMask | "You cancelled the signature." | | ☐ |
| 1.6 | Withdraw 0.02 | One tx; position decreases; capped at idle liquidity (try MAX) | | ☐ |
| 1.7 | Start a withdraw, navigate to Audit while pending, come back | Status shows "Pending onchain" then "Confirmed" (state recovers) | | ☐ |

## 2 · Vendor (QA_VENDOR)

| # | Step | Expected | Actual / screenshot / tx | ✅ |
|---|---|---|---|---|
| 2.1 | `/app/vendor` | No "This wallet isn't a vendor yet" banner (already onboarded) | | ☐ |
| 2.2 | Create invoice 0.10 to **#1 · Frontier Lab**, attach any PDF | "keccak256 … · from file"; tx confirms; then "Frontier Lab is reviewing…" → "Frontier Lab confirmed it" with a tx link | | ☐ |
| 2.3 | Advance offer card | Band, 75% advance (0.075), fee, plain-English explanation | | ☐ |
| 2.4 | **Accept and fund advance** | One tx; invoice → Funded; a JobWallet address appears | | ☐ |
| 2.5 | Open the invoice → Grant session to the payout agent (cap 0.03, total 0.07, 24h) | SessionGranted; session card shows caps and expiry | | ☐ |
| 2.6 | On the invoice, "Send a payment" 0.01 to an address that is **not** an approved payee (e.g. `0x3a01A37ee421C1485726B361F401cfc2C08Be03f`) | Refused before signing with "This payee isn't on the job's approved list." (the owner is limited to approved payees; caps apply to session keys, see 5.3) | | ☐ |
| 2.7 | Revoke the session | SessionKeyRevoked; card shows "Revoked" | | ☐ |
| 2.8 | Create a 0.25 invoice to Frontier Lab | Created, but "Frontier Lab didn't auto-confirm: … up to 0.20 tUSD8 only." | | ☐ |

## 3 · Lab (QA_LAB)

Ask QA_VENDOR (or yourself in another browser profile) to create a 0.10 invoice to **QA Lab (M2)**.

| # | Step | Expected | Actual / screenshot / tx | ✅ |
|---|---|---|---|---|
| 3.1 | `/app/lab` → Awaiting confirmation → **Review and confirm** | Plain-English summary: amount, vendor, due date, payee = Autorail router; "View raw typed data" shows the EIP-712 fields | | ☐ |
| 3.2 | Sign confirmation | One EIP-712 signature + one tx; moves to "To pay" after the vendor funds it | | ☐ |
| 3.3 | Vendor funds it (2.4); then **Pay invoice** | One EIP-3009 signature, **no gas** ("the relayer pays gas"); waterfall: vault principal, vault fee (e.g. 0.0015, never 0.00), vendor remainder | | ☐ |
| 3.4 | Reject the pay signature in MetaMask | "You cancelled the signature." | | ☐ |
| 3.5 | Audit → filter by the invoice | Created, Confirmed, Funded, Session, Paid, Repaid, Reputation rows with explorer links | | ☐ |

## 4 · Fresh "judge" wallet onboarding (new MetaMask account, 0 tQDAY)

| # | Step | Expected | Actual / screenshot / tx | ✅ |
|---|---|---|---|---|
| 4.1 | `/app` → sidebar **New here? Get started** | Onboarding page with 4 steps | | ☐ |
| 4.2 | Connect | Balances 0 / 0; "Get 0.02 tQDAY" offer; faucet link for tUSD8 | | ☐ |
| 4.3 | **Get 0.02 tQDAY** | Within ~10 s tQDAY shows 0.02; tx link | | ☐ |
| 4.4 | Click it again | "This wallet already has enough tQDAY" / "already received gas" | | ☐ |
| 4.5 | Choose **Vendor**, name it, **Register agent** | One tx; "Agent #N registered" | | ☐ |
| 4.6 | **Sign and get my role** | One message signature (no gas); "Role assigned" with tx link | | ☐ |
| 4.7 | Go to the Vendor screen; create a 0.05 invoice to Frontier Lab | Auto-confirmed by Frontier Lab; an offer appears; accept → Funded | | ☐ |
| 4.8 | Reload onboarding | Step 4 "You're in"; "agent #N ✓" on the Vendor card | | ☐ |

## 5 · Agents · Run live (any wallet, no signature needed)

| # | Step | Expected | Actual / screenshot / tx | ✅ |
|---|---|---|---|---|
| 5.1 | `/app/agents` → Demo runner → **Recorded run** → Replay | Steps 1 → 12 (7a–7c, 10a/10b) in order, each with an explorer link; Present mode works with → ← R Esc | | ☐ |
| 5.2 | **Run live** | Preflight OK line with balances, or a clear "Not enough tUSD8: …" message | | ☐ |
| 5.3 | Run all (needs ~0.18 tUSD8 on the demo lender and buyer) | 15/15; steps 8, 9, 10b show red "Reverted onchain: …" with tx links | | ☐ |

## 6 · Audit

| # | Step | Expected | Actual / screenshot / tx | ✅ |
|---|---|---|---|---|
| 6.1 | `/app/audit` | Events grouped by day; blocked attempts in red with plain-English reasons | | ☐ |
| 6.2 | Filter by invoice, agent #0, type "Payments" | List narrows correctly | | ☐ |
| 6.3 | Open 3 random tx links | Each opens on explorer-test.qday.info and matches the row | | ☐ |

## 7 · Mobile pass (MetaMask mobile → Browser)

Open https://autorail-qday.vercel.app inside the MetaMask app's browser.

| # | Step | Expected | Actual / screenshot / tx | ✅ |
|---|---|---|---|---|
| 7.1 | Landing at phone width | No sideways scrolling; proof strip wraps | | ☐ |
| 7.2 | `/app` | Bottom tab bar; header shows "Live / Demo" compact toggle; Connect works | | ☐ |
| 7.3 | Lend: deposit 0.02 | Permit signature + tx work in the in-app browser | | ☐ |
| 7.4 | Lab: confirm + pay a 0.05 invoice | EIP-712 review readable; pay is gasless | | ☐ |
| 7.5 | Onboarding with a new account | Drip, register, role all work on mobile | | ☐ |
| 7.6 | Audit | Rows readable; tx links open the explorer | | ☐ |

---

## Bug report template

```
Title:
Route:                      (e.g. /app/lab)
Wallet:                     (QA_LAB 0x59Fb…10F / fresh account 0x…)
Device / browser:           (desktop Chrome + MetaMask 12.x / MetaMask mobile iOS)
Mode:                       Live (Aevum) | Demo data
Steps to reproduce:
  1.
  2.
Expected:
Actual:
Console log:                (DevTools → Console, copy errors)
Tx hash / explorer link:
/api/health at the time:    (status + warnings)
Screenshot:
```
