"use client";
import type { Address, ReceivableId } from "@/lib/autorail";
import { useAutorailQuery } from "./useClient";

export function useJobWallet(receivableId: ReceivableId | undefined) {
  return useAutorailQuery(["jobwallet", receivableId], (c) => c.getJobWallet(receivableId!), receivableId !== undefined);
}

export function usePayments(jobWallet: Address | undefined) {
  return useAutorailQuery(["payments", jobWallet], (c) => c.getPayments(jobWallet!), !!jobWallet);
}
