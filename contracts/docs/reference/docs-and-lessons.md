Sources (snapshots in this folder, fetched 2026-11-21):
- https://wiki.qday.info/Knowledge/technical/developer-guide/getting-started/ → `source-wiki-getting-started.txt`
- https://wiki.qday.info/Knowledge/technical/developer-guide/smart-contract-development/ → `source-wiki-smart-contract-development.txt`
- https://wiki.qday.info/Knowledge/technical/developer-guide/sdk-code-examples/ → `source-wiki-sdk-code-examples.txt`
- https://wiki.qday.info/Knowledge/technical/developer-guide/wallet-integration → `source-wiki-wallet-integration.txt`
- https://community.qday.io/guide/ → `source-community-guide.txt`
- https://github.com/honyg143/Relaypay README → `source-relaypay-readme.md`

# Official docs: what matters for us
- Chain 44005, RPC `https://rpc-test.qday.info`. The docs' viem example lists `webSocket: wss://rpc-test.qday.info`, but the kit and the organizers say it doesn't work, so **we poll over HTTPS**.
- Mainnet will be chain **44002** (parameters published at launch). The faucet is `faucet.qday.info` (kit: `https://faucet.qday.info/en`). **Note for the web app:** its `SITE.faucetUrl` placeholder should become `https://faucet.qday.info/en` (not changed here, per the "don't edit the app" rule).
- The docs describe ERC-4337 smart accounts, a paymaster and session keys as "live on testnet", but the SDK is "planned Q1 2027, not yet on npm" and the Aevum bundler endpoint is "to be published". This matches the organizers' answer: **no bundler or paymaster today**, so session keys, caps, expiry and revoke live in our own `JobWallet`.
- Any EVM tooling works unmodified (Foundry/viem/wagmi).

# Relaypay: presentation lessons only (no code copied)
1. Caps live **in the contract**, not in the runner, so the runner can't exceed them. Same as our JobWallet.
2. Failure is recorded **onchain** (`Failed` state) rather than paying partially. We do the same for blocked attempts: they're real mined, reverted txs with decoded custom errors.
3. The README leads with a network table, the contract address, an explorer link, the deploy tx hash and a note that explorer verification is down. We copy that structure.
4. **Test counts must be consistent.** The README snapshot we read says "19 Foundry tests"; the brief notes their repo gives two different counts, which we didn't independently confirm. Our README takes the count from `forge test` output and states it **once**, in a single table that every other section references.
