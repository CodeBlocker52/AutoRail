# QA accounts (M2)

Burner wallets for QA on QDay Aevum testnet (chain 44005). **Testnet only.** Private keys live only in the git-ignored `web/.env.qa` (and `docs/QA_KEYS_FOR_METAMASK.md`, also git-ignored).

| Role | Address | Funded from (recycled demo balances) |
|---|---|---|
| QA_LENDER | [`0xC0327E7A5804f518584Bb5650A206dc7958D0C01`](https://explorer-test.qday.info/address/0xC0327E7A5804f518584Bb5650A206dc7958D0C01) | 0.3 tUSD8 (Annotator A) · 0.1 tQDAY (merchant) |
| QA_VENDOR | [`0x3Cd8ad29Fc4da00930438549b78643cD98fa7C00`](https://explorer-test.qday.info/address/0x3Cd8ad29Fc4da00930438549b78643cD98fa7C00) | 0.1 tQDAY (merchant) |
| QA_LAB | [`0x59Fb43d58fb8A99A989218E3A969F3969651b10F`](https://explorer-test.qday.info/address/0x59Fb43d58fb8A99A989218E3A969F3969651b10F) | 0.3 tUSD8 (Annotator B) · 0.1 tQDAY (underwriter) |

Server wallets added in M2:

| Wallet | Address | Funded |
|---|---|---|
| ROLES_OPERATOR (owns AutorailRoles) | [`0x6e81E1c398152fdadB6ca16865f2f7882a3d0D58`](https://explorer-test.qday.info/address/0x6e81E1c398152fdadB6ca16865f2f7882a3d0D58) | 0.03 tQDAY (underwriter) |
| DRIP (tQDAY gas drip, capped) | [`0x635D21CddC2A0d8B8E51db65E4C8d16A23b2a37A`](https://explorer-test.qday.info/address/0x635D21CddC2A0d8B8E51db65E4C8d16A23b2a37A) | 0.12 tQDAY (underwriter) |

Check balances: `cd web && node scripts/qa/balances.mjs`.
