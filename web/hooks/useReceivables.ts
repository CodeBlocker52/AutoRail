"use client";
import { useAutorailQuery } from "./useClient";

export function useReceivables() {
  return useAutorailQuery(["receivables"], (c) => c.getReceivables());
}

export function useReceivable(id: number | undefined) {
  return useAutorailQuery(["receivable", id], (c) => c.getReceivable(id!), id !== undefined);
}

export function useAdvanceOffer(id: number | undefined) {
  return useAutorailQuery(["offer", id], (c) => c.getAdvanceOffer(id!), id !== undefined);
}

export function useRepayment(id: number | undefined) {
  return useAutorailQuery(["repayment", id], (c) => c.getRepayment(id!), id !== undefined);
}

export function useConfirmationTypedData(id: number | undefined) {
  return useAutorailQuery(["typed-confirm", id], (c) => c.getConfirmationTypedData(id!), id !== undefined);
}

export function usePaymentTypedData(id: number | undefined) {
  return useAutorailQuery(["typed-pay", id], (c) => c.getPaymentTypedData(id!), id !== undefined);
}
