# Open questions

| # | Question | Status | Owner |
|---|---|---|---|
| Q1 | **tUSD8 shortfall.** The deployer holds **2.00 tUSD8** (probe on 2026-11-21); the brief assumed ~3 and the demo budget needs **≈ 2.81**. Options: (a) teammates send ≥ 0.85 tUSD8 to `0x23aF45aa18b83a1E07fe3b9DcB3eB5f6A84bD3AC`; (b) run the Aevum demo with every amount scaled down (all amounts are constants in `script/DemoConfig.sol`) | **Resolved 2026-11-21**: topped up to 3.00 tUSD8; deployed | User |
| Q2 | Explorer contract verification (Blockscout) is down | Not blocking; addresses + commit link go in the README, and the verify command is in CHAIN.md | Organizers |
| Q3 | WebSocket `wss://rpc-test.qday.info` is listed in the docs but reported not working | We poll over HTTPS | — |
| Q4 | Block headers carry `baseFeePerGas` (7 wei). Would type-2 txs also work? | Not needed; we stay on legacy (type 0) as the kit and organizers advise | — |
| Q5 | The web app's faucet link placeholder should be `https://faucet.qday.info/en` | Frontend task (app not edited in this phase) | Frontend |
| Q6 | The official ERC-8004 IdentityRegistry fails the kit's **linear** `check-shanghai` on one via-IR data byte, proven unreachable (PROGRESS.md decision 2). Keep the official registries (current choice), or switch to a minimal interface-identical implementation as the brief's fallback? | Decided: keep official; reversible | User |
| Q7 | Receivable ids are `bytes32` onchain; the mock UI uses numbers. The onchain adapter needs a mapping (frontend task; the app wasn't edited) | Open | Frontend |
| Q8 | ERC-8004 agent ids start at **0** on our deployment (demo agents 0–4), not the mock UI's #3/#7/#9/#11/#12 | Informational | Frontend |
