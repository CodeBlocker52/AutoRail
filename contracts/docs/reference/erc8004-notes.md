Sources:
- https://eips.ethereum.org/EIPS/eip-8004 (spec copy: `erc-8004-contracts/ERC8004SPEC.md`)
- https://github.com/erc-8004/erc-8004-contracts at commit `b9e466c250744a7e06b13dff9d3c2844ed64f825` (2026-08-15), MIT

Read: 2026-11-21

# ERC-8004 notes

## Identity Registry (`IdentityRegistryUpgradeable`, v2.0.0)
- ERC-721 (`AgentIdentity`/`AGENT`) + URI storage, UUPS, EIP-712 (`ERC8004IdentityRegistry`, `1`).
- `register() / register(string agentURI) / register(string agentURI, MetadataEntry[] metadata) → uint256 agentId`
  - **IDs start at 0** (`_lastId++`). The minter becomes owner, and `agentWallet` metadata is set to `msg.sender`.
  - Events: `Registered(uint256 indexed agentId, string agentURI, address indexed owner)` and `MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)`, plus ERC-721 `Transfer`.
- `setAgentURI(uint256 agentId, string newURI)` → `URIUpdated(agentId, newURI, updatedBy)`.
- `getMetadata / setMetadata` (the `agentWallet` key is reserved).
- `setAgentWallet(agentId, newWallet, deadline, signature)`: EIP-712 `AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)`, deadline ≤ now + 5 min, ECDSA **or ERC-1271**. `getAgentWallet`, `unsetAgentWallet`. The wallet is cleared on transfer.
- `isAuthorizedOrOwner(spender, agentId)`.

## Reputation Registry (`ReputationRegistryUpgradeable`, v2.0.0)
- `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`
  - `valueDecimals ≤ 18`, |value| ≤ 1e38.
  - **Self-feedback rule:** reverts `"Self-feedback not allowed"` if `msg.sender` is the agent's owner or an approved operator (`isAuthorizedOrOwner`). It also reverts for a non-existent agent.
  - **No pre-authorisation**: any non-owner address may give feedback (spec v2 dropped `feedbackAuth`).
  - Event `NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`.
- `getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) → (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)`. **`clientAddresses` must be non-empty** (Sybil protection), so Autorail queries `[RepaymentRouter, CreditFacility]`.
- `readFeedback`, `readAllFeedback`, `revokeFeedback`, `appendResponse`, `getClients`, `getLastIndex`, `getResponseCount`.

## Shanghai compatibility
- The repo's own `hardhat.config.ts` compiles both contracts with solc **0.8.24, `evmVersion: "shanghai"`**.
- No transient storage and no MCOPY in the source. Under `evm_version = "shanghai"`, OpenZeppelin 5.4 emits neither (MCOPY is only emitted when targeting Cancun). This is confirmed by `tools/check-shanghai.mjs` on our build (see PROGRESS.md).

## How Autorail deploys them (decision)
- We use the **official implementations, unmodified** (vendored under `contracts/src/erc8004/` with their MIT header and the commit hash).
- They initialise through `reinitializer(2) onlyOwner`, which assumes a proxy bootstrapped by `MinimalUUPS`. The repo's `MinimalUUPS` hard-codes the ERC-8004 team's owner (`0x5472…2603`), so we can't use it. Instead, `src/erc8004/ERC8004Bootstrap.sol` is a ~15-line UUPS stub with `initialize(owner)` (version 1). Deploy sequence: `ERC1967Proxy(bootstrap, initialize(admin))` → `upgradeToAndCall(officialImpl, initialize(...))`.
- Feedback values used: on time **100**, late **50**, default **0**, `valueDecimals = 0`, `tag1 = "credit"`, `tag2 = "repaid_on_time" | "repaid_late" | "defaulted"`. Client addresses: RepaymentRouter (repayments) and CreditFacility (defaults).
