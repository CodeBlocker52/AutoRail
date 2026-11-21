# Third-party notices

Autorail contracts are MIT licensed. They build on the projects below.

## Copied or vendored (with their licences kept)

| What | From | Licence | Where in this repo |
|---|---|---|---|
| ERC-8004 `IdentityRegistryUpgradeable.sol`, `ReputationRegistryUpgradeable.sol` (**unmodified**, provenance comment added) | https://github.com/erc-8004/erc-8004-contracts @ `b9e466c250744a7e06b13dff9d3c2844ed64f825` | MIT | `src/erc8004/` |
| `tools/check-shanghai.mjs` (unchanged, credit line added) | Aevum Starter Kit @ `e87bcff` | MIT, © 2026 PQA Labs | `tools/` |
| `tools/check-shanghai-reachable.mjs` (derived, reachability pass added) | Aevum Starter Kit `tools/check-shanghai.mjs` | MIT, © 2026 PQA Labs | `tools/` |
| `@aevum-kit/aevum` sources (chain config, EIP-3009 typed data, `getLogsChunked`) | Aevum Starter Kit `packages/aevum/src` @ `e87bcff` | MIT, © 2026 PQA Labs | `scripts/e2e/aevum-kit/` (LICENSE included) |

## Patterns "based on" (credited in code comments, no verbatim copy)

- **Aevum Starter Kit (MIT, PQA Labs):** the `Checkout` EIP-3009 pattern (`receiveWithAuthorization` plus `authorizationNonce(id)`), reused in `RepaymentRouter`; `MockUSD8`, the base of `test/mocks/MockTUSD8.sol` (EIP-2612 permit added); `test/Signing.sol`, the base of `test/utils/Sigs.sol`; the Makefile `fork`/`deal` targets; the relayer rails in `scripts/e2e/relayer.ts`.

## Libraries (installed, not copied)

| Project | Version | Licence |
|---|---|---|
| OpenZeppelin Contracts | v5.4.0 | MIT |
| OpenZeppelin Contracts Upgradeable | v5.4.0 | MIT |
| forge-std | v1.17.0 | MIT or Apache-2.0 |
| viem | ^2.58 | MIT |
| tsx, typescript | dev only | MIT, Apache-2.0 |

## Aevum Starter Kit licence (MIT)

```
MIT License

Copyright (c) 2026 PQA Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
