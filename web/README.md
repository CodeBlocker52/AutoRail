# Autorail web

Landing page and app for Autorail on QDay Aevum testnet (chain 44005). Three modes: **mock** (default, in-memory), **fork** (local anvil copy of Aevum, chain 440050) and **Aevum** (the live deployment).

```bash
pnpm install
cp .env.example .env.local   # pick a mode; server keys only for onchain features
pnpm dev
```

See [docs/UI.md](docs/UI.md) for modes, the env table (server vs public), the API routes, tests and the fork e2e.

Chain definitions come from Aevum Starter Kit's `@aevum-kit/aevum` (MIT, PQA Labs), vendored in `lib/aevum-kit/`.

Testnet only. tUSD8 and tQDAY are test assets with no monetary value. Contracts are unaudited.
