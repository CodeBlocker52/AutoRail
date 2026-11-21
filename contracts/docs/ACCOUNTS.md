# Accounts (addresses only; keys live in `contracts/.env`, which is gitignored)

Generated 2026-11-21 with random 32-byte keys. **Testnet only.**

| Role | Address | Purpose | tQDAY | tUSD8 |
|---|---|---|---|---|
| `DEPLOYER` | [`0x23aF45aa18b83a1E07fe3b9DcB3eB5f6A84bD3AC`](https://explorer-test.qday.info/address/0x23aF45aa18b83a1E07fe3b9DcB3eB5f6A84bD3AC) | Deploys; initial admin | ✓ | source of all funds |
| `UNDERWRITER` | [`0xbAf25616a9596075cfac6fED580dF360cb0AF7bE`](https://explorer-test.qday.info/address/0xbAf25616a9596075cfac6fED580dF360cb0AF7bE) | Signs funding offers (EIP-712); owns the Underwriter agent | ✓ |  |
| `RELAYER` | [`0x435533067198cf98523Fe3ffEfca476Fa8386E26`](https://explorer-test.qday.info/address/0x435533067198cf98523Fe3ffEfca476Fa8386E26) | Submits the gasless EIP-3009 payment | ✓ (small) |  |
| `LENDER` | [`0x4E79fE26D017B4b68dd0aD39f17aa625D209b7e6`](https://explorer-test.qday.info/address/0x4E79fE26D017B4b68dd0aD39f17aa625D209b7e6) | Deposits into the vault | ✓ | ✓ |
| `SELLER` | [`0x2366C8cAD102855a028F0eA78C9C15e84dB9B98D`](https://explorer-test.qday.info/address/0x2366C8cAD102855a028F0eA78C9C15e84dB9B98D) | Lumen Data: seller agent owner, JobWallet owner | ✓ |  |
| `BUYER` | [`0x7e2248174a3D12C0cb64465c041C512C45b9246b`](https://explorer-test.qday.info/address/0x7e2248174a3D12C0cb64465c041C512C45b9246b) | Frontier Lab buyer agent: confirms and signs the payment | ✓ | ✓ |
| `PAYOUT_SESSION` | [`0xf6D2c420C783F3e8c4cF26B50De564cB9dB25614`](https://explorer-test.qday.info/address/0xf6D2c420C783F3e8c4cF26B50De564cB9dB25614) | Payout agent session key; owns the Payout agent | ✓ |  |
| `MERCHANT` | [`0xe278C0d386195A65b76601F53deC8C50724F0f54`](https://explorer-test.qday.info/address/0xe278C0d386195A65b76601F53deC8C50724F0f54) | Kestrel GPU x402 merchant agent | ✓ |  |
| `ANNOTATOR_A` | [`0xd052D3972BdE6a8D7A7caC98DA49dDb825822ff7`](https://explorer-test.qday.info/address/0xd052D3972BdE6a8D7A7caC98DA49dDb825822ff7) | Payee (key kept for recycling only) | small |  |
| `ANNOTATOR_B` | [`0xd7fC8c9c040c89121b3c23821331D1F31Cd05BB3`](https://explorer-test.qday.info/address/0xd7fC8c9c040c89121b3c23821331D1F31Cd05BB3) | Payee (key kept for recycling only) | small |  |
| `ROGUE` | [`0x3a01A37ee421C1485726B361F401cfc2C08Be03f`](https://explorer-test.qday.info/address/0x3a01A37ee421C1485726B361F401cfc2C08Be03f) | Injected "0xBAD…" payee (never approved) |  |  |

`ADMIN_ADDRESS` (Ownable2Step owner) = `0x23aF45aa18b83a1E07fe3b9DcB3eB5f6A84bD3AC` (the deployer by default).

Use a Foundry keystore instead of the raw key (recommended):

```bash
cast wallet import autorail-deployer --interactive   # paste the key once; it's stored encrypted
make deploy-aevum ACCOUNT=autorail-deployer
```
