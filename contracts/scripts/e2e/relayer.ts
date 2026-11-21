/**
 * Relayer for the gasless EIP-3009 payment. Rails (from Aevum Starter Kit's relay route, MIT, PQA Labs):
 *  1. Only our RepaymentRouter, only payWithAuthorization.
 *  2. Only the invoice amount of a Funded/Overdue receivable.
 *  3. Skips repaid or in-flight receivables.
 *  4. validBefore − now ≤ 1 hour.
 *  5. Simulates first; holds only a little tQDAY.
 */
import { parseSignature, type Address, type Hex, type PublicClient } from "viem";
import { abi, type Actor, type Deployment, type Sender } from "./lib";

const MAX_WINDOW = 3600n;
const STATE = ["None", "Created", "Confirmed", "Funded", "Repaid", "Overdue", "Defaulted"];
const inFlight = new Set<string>();

export interface Authorization {
  receivableId: Hex;
  from: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  signature: Hex;
}

export async function relay(
  client: PublicClient,
  sender: Sender,
  d: Deployment,
  relayer: Actor,
  auth: Authorization,
  onHash: (h: Hex) => void,
) {
  const key = auth.receivableId.toLowerCase();
  if (inFlight.has(key)) throw new Error("relayer: already in flight");
  const r = (await client.readContract({ address: d.registry, abi: abi.registry, functionName: "get", args: [auth.receivableId] })) as {
    amount: bigint;
    state: number;
  };
  if (STATE[r.state] === "Repaid") throw new Error("relayer: already repaid");
  if (STATE[r.state] !== "Funded" && STATE[r.state] !== "Overdue") throw new Error(`relayer: not payable (${STATE[r.state]})`);
  if (auth.value !== r.amount) throw new Error("relayer: amount differs from the invoice");
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (auth.validBefore - now > MAX_WINDOW) throw new Error("relayer: signature window over 1 hour");
  const expected = (await client.readContract({ address: d.router, abi: abi.router, functionName: "authorizationNonce", args: [auth.receivableId] })) as Hex;
  if (auth.nonce !== expected) throw new Error("relayer: nonce not bound to this receivable");

  const { v, r: rr, s, yParity } = parseSignature(auth.signature);
  const call = {
    address: d.router,
    abi: abi.router,
    functionName: "payWithAuthorization",
    args: [auth.receivableId, auth.from, auth.value, auth.validAfter, auth.validBefore, auth.nonce, v !== undefined ? Number(v) : 27 + (yParity ?? 0), rr, s],
  } as const;
  inFlight.add(key);
  try {
    await sender.simulate(relayer, call);
    const hash = await sender.send(relayer, call, { onHash });
    return { hash, call };
  } finally {
    inFlight.delete(key);
  }
}
