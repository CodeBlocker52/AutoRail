import { getAddress, isHex } from "viem";
import { json, fail, isAddr, isUint } from "@/lib/server/http";
import { onboard, onboardingMessage, type OnboardRole } from "@/lib/server/onboard";
import { clientIp, limited } from "@/lib/server/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET ?address&agentId&role&issuedAt → the exact message to sign (so the UI and server can't drift). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const address = q.get("address");
  const agentId = q.get("agentId");
  const role = q.get("role");
  const issuedAt = q.get("issuedAt") ?? new Date().toISOString();
  if (!isAddr(address) || !isUint(agentId) || (role !== "vendor" && role !== "lab")) return json({ code: "BadRequest", message: "address, agentId and role (vendor|lab) are required." }, 400);
  return json({ message: onboardingMessage({ address: getAddress(address), agentId: BigInt(agentId), role, issuedAt }), issuedAt });
}

/**
 * POST { address, agentId, role: "vendor" | "lab", issuedAt, signature }
 * The operator assigns Seller (vendor) or Buyer + tier 1 (lab) to the caller's own, role-less ERC-8004 agent.
 * Rate limits: 5 / hour per IP and 3 / hour per wallet (Upstash). Idempotent per wallet + role.
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Record<string, unknown>;
    if (!isAddr(b.address) || !isUint(String(b.agentId ?? "")) || (b.role !== "vendor" && b.role !== "lab") || typeof b.issuedAt !== "string" || !(typeof b.signature === "string" && isHex(b.signature))) {
      return json({ code: "BadRequest", message: "Malformed onboarding request." }, 400);
    }
    if (await limited(`onboard:ip:${clientIp(req)}`, 5, 3600)) return json({ code: "RateLimited", message: "Too many onboarding requests from this network. Try again in an hour." }, 429);
    if (await limited(`onboard:wallet:${String(b.address).toLowerCase()}`, 3, 3600)) return json({ code: "RateLimited", message: "Too many onboarding requests for this wallet. Try again in an hour." }, 429);
    return json(await onboard({ address: b.address, agentId: BigInt(String(b.agentId)), role: b.role as OnboardRole, issuedAt: b.issuedAt, signature: b.signature }));
  } catch (e) {
    return fail(e, "onboard");
  }
}
