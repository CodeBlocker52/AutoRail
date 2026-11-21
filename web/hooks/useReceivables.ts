"use client";
import type { ReceivableId } from "@/lib/autorail";
import { useAutorailQuery } from "./useClient";

export function useReceivables() {
  return useAutorailQuery(["receivables"], (c) => c.getReceivables());
}

export function useReceivable(id: ReceivableId | undefined) {
  return useAutorailQuery(["receivable", id], (c) => c.getReceivable(id!), id !== undefined);
}

export function useAdvanceOffer(id: ReceivableId | undefined) {
  return useAutorailQuery(["offer", id], (c) => c.getAdvanceOffer(id!), id !== undefined);
}

export function useRepayment(id: ReceivableId | undefined) {
  return useAutorailQuery(["repayment", id], (c) => c.getRepayment(id!), id !== undefined);
}

export function useConfirmationTypedData(id: ReceivableId | undefined) {
  return useAutorailQuery(["typed-confirm", id], (c) => c.getConfirmationTypedData(id!), id !== undefined);
}

export function usePaymentTypedData(id: ReceivableId | undefined) {
  return useAutorailQuery(["typed-pay", id], (c) => c.getPaymentTypedData(id!), id !== undefined);
}
