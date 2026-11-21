import "server-only";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Hex } from "viem";

/**
 * Server-side role keys. NEVER prefix these with NEXT_PUBLIC_ (that would ship them to the browser).
 * On Vercel, mark them "Sensitive". Values may be given with or without 0x.
 */
export type KeyName =
  | "UNDERWRITER_PRIVATE_KEY"
  | "RELAYER_PRIVATE_KEY"
  | "PAYOUT_SESSION_PRIVATE_KEY"
  | "LENDER_PRIVATE_KEY"
  | "SELLER_PRIVATE_KEY"
  | "BUYER_PRIVATE_KEY";

const cache = new Map<KeyName, PrivateKeyAccount | null>();

export function account(name: KeyName): PrivateKeyAccount | null {
  if (!cache.has(name)) {
    const raw = process.env[name]?.trim();
    const key = (raw?.startsWith("0x") ? raw : `0x${raw ?? ""}`) as Hex;
    cache.set(name, raw && /^0x[0-9a-fA-F]{64}$/.test(key) ? privateKeyToAccount(key) : null);
  }
  return cache.get(name)!;
}

export function requireAccount(name: KeyName): PrivateKeyAccount {
  const a = account(name);
  if (!a) throw new ServerConfigError(`${name} is not configured on the server`);
  return a;
}

export class ServerConfigError extends Error {}
