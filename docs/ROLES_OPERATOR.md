# AutorailRoles operator

Self-serve onboarding (`/api/onboard`) has to call `AutorailRoles.setRole` / `setBuyerTier`, which are `onlyOwner`. So the server
holds a dedicated **ROLES_OPERATOR** key that owns **only `AutorailRoles`**. Every other contract (vault, registry, facility, JobWallet
factory, router) stays owned by the deployer, and the deployer key is never on the server.

| | |
|---|---|
| AutorailRoles | [`0xb011da7b39C6cB038E1a01E0c114305551d76AA9`](https://explorer-test.qday.info/address/0xb011da7b39C6cB038E1a01E0c114305551d76AA9) |
| Operator (owner since 2026-11-22) | [`0x6e81E1c398152fdadB6ca16865f2f7882a3d0D58`](https://explorer-test.qday.info/address/0x6e81E1c398152fdadB6ca16865f2f7882a3d0D58) |
| Deployer (previous owner) | `0x23aF45aa18b83a1E07fe3b9DcB3eB5f6A84bD3AC` |
| Transfer | [transferOwnership](https://explorer-test.qday.info/tx/0x123fffad6a5488f5e42c903a4b9b787e19d33150899683a42e55c1396a10b800) · [acceptOwnership](https://explorer-test.qday.info/tx/0x20ed17bedd7a26532996f610971ce221ae435619dfbc6c9f49047042d598ff50) |

The key lives in `contracts/.env` and `web/.env.local` (both git-ignored) and on Vercel as the **Sensitive** variable `ROLES_OPERATOR_PRIVATE_KEY`.

## What the operator may do (enforced in `web/lib/server/onboard.ts`)

- Assign **Seller** or **Buyer** only, and only to an agent that has **no role yet** (so our agents #0–#4 can never be re-roled), owned by the wallet that signed the onboarding request.
- Buyer tier is always **1**.
- Never assigns Underwriter, Payout or Merchant. It can't touch money: `AutorailRoles` holds no funds and has no other admin powers.

## Script

```bash
cd contracts
scripts/roles-ownership.sh status             # read-only
scripts/roles-ownership.sh to-operator        # deployer → transferOwnership(operator)   (done)
scripts/roles-ownership.sh accept-operator    # operator → acceptOwnership()              (done)
```

### Transfer back to the deployer

```bash
scripts/roles-ownership.sh back-to-deployer   # operator → transferOwnership(deployer)
scripts/roles-ownership.sh accept-deployer    # deployer → acceptOwnership()
```

After that, remove `ROLES_OPERATOR_PRIVATE_KEY` from Vercel: `/api/onboard` then answers 503 "not configured" and the rest of the app keeps working.

### If the operator key leaks

The worst case is that someone assigns roles. Transfer back right away (the two commands above, which need the leaked key for step 1). If you've lost the operator key itself, ownership can't be recovered without it, so keep a backup. Then generate a new operator key and transfer to it. Roles already granted stay; re-assign them with the new owner if needed (`setRole` overwrites).

### Rehearse on a fork

```bash
make fork   # terminal 1
RPC=http://127.0.0.1:8555 DEPLOYMENT=deployments/44005.json scripts/roles-ownership.sh to-operator   # etc.
```
