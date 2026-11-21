import { defineConfig } from "@playwright/test";

/**
 * E2E against the local Aevum fork (chain 440050): `make fork` + `make deploy-fork register-agents-fork fund-fork`
 * in contracts/, then `SYNC_INCLUDE_FORK=1 pnpm sync` here. No real tUSD8 is spent.
 */
const PORT = 3312;
export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome", viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure" },
  webServer: {
    command: `pnpm dev -p ${PORT}`,
    port: PORT,
    timeout: 180_000,
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_AUTORAIL_MODE: "onchain",
      NEXT_PUBLIC_AUTORAIL_CHAIN_ID: "440050",
      NEXT_PUBLIC_FORK_RPC_URL: "http://127.0.0.1:8555",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
