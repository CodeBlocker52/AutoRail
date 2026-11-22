import type { ActivityEvent, Receivable } from "./types";

export interface Settlement {
  event: ActivityEvent;
  receivable: Receivable | null;
  mock: boolean;
}

/**
 * Latest InvoiceRepaid event for the landing-page proof strip.
 * Onchain: the latest RepaymentRouter `Repaid` event from /api/proof (server-side indexer, cached). Mock: a separate, fully-played demo run, so the app's own mock state is untouched.
 * Loaded with dynamic import so the landing bundle stays small.
 */
export async function latestSettlement(): Promise<Settlement | null> {
  const { resolveMode, setRuntimeMode } = await import("./mode");
  const mode = resolveMode();
  setRuntimeMode(mode); // explorer links on the landing page follow the same Live / Demo choice
  if (mode === "onchain") return fromApi();
  let client;
  {
    const { MockAutorailClient } = await import("./mock");
    const m = new MockAutorailClient();
    await m.resetDemo("complete");
    client = m;
  }
  const [event] = await client.getActivity({ types: ["invoice.repaid"], limit: 1 });
  if (!event) return null;
  const receivable = event.receivableId !== undefined ? await client.getReceivable(event.receivableId) : null;
  return { event, receivable, mock: true };
}

async function fromApi(): Promise<Settlement | null> {
  const res = await fetch("/api/proof");
  if (!res.ok) return null;
  const p = (await res.json()) as { receivableId: string; vaultAmount: string; sellerAmount: string; txHash: `0x${string}`; block: number; timestamp: number; onTime: boolean; invoiceNumber?: string };
  const amount = BigInt(p.vaultAmount) + BigInt(p.sellerAmount);
  const event: ActivityEvent = {
    id: p.txHash,
    type: "invoice.repaid",
    title: "Repaid",
    status: "ok",
    receivableId: p.receivableId,
    txHash: p.txHash,
    block: p.block,
    timestamp: p.timestamp,
  };
  const receivable = { invoiceNumber: p.invoiceNumber ?? `Invoice ${p.receivableId.slice(0, 8)}…`, amount } as Receivable;
  return { event, receivable, mock: false };
}
