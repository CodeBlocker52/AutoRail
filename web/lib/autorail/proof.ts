import type { ActivityEvent, Receivable } from "./types";

export interface Settlement {
  event: ActivityEvent;
  receivable: Receivable | null;
  mock: boolean;
}

/**
 * Latest InvoiceRepaid event for the landing-page proof strip.
 * Onchain: real chain. Mock: a separate, fully-played demo run, so the app's own mock state is untouched.
 * Loaded with dynamic import so the landing bundle stays small.
 */
export async function latestSettlement(): Promise<Settlement | null> {
  const { AUTORAIL_MODE, getAutorailClient } = await import("./index");
  let client;
  if (AUTORAIL_MODE === "onchain") client = getAutorailClient();
  else {
    const { MockAutorailClient } = await import("./mock");
    const m = new MockAutorailClient();
    await m.resetDemo("complete");
    client = m;
  }
  const [event] = await client.getActivity({ types: ["invoice.repaid"], limit: 1 });
  if (!event) return null;
  const receivable = event.receivableId !== undefined ? await client.getReceivable(event.receivableId) : null;
  return { event, receivable, mock: AUTORAIL_MODE !== "onchain" };
}
