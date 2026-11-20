"use client";
import type { Address } from "@/lib/autorail";
import { useAutorailQuery } from "./useClient";

export function useBalances(account: Address | undefined) {
  return useAutorailQuery(["balances", account], (c) => c.getBalances(account!), !!account);
}
