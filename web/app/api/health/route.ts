import { json, fail } from "@/lib/server/http";
import { health } from "@/lib/server/onboard";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET → mode, chain, latest block, contracts, commits, KV, feature flags and server-wallet tQDAY balances. No secrets. */
export async function GET() {
  try {
    const h = (await health()) as { status: string };
    return json(h, h.status === "down" ? 503 : 200);
  } catch (e) {
    return fail(e, "health");
  }
}
