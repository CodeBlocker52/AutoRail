"use client";
import type { Address } from "@/lib/autorail";
import { useAutorailQuery } from "./useClient";

export function useVault() {
  return useAutorailQuery(["vault"], (c) => c.getVaultStats());
}

export function useLenderPosition(account: Address | undefined) {
  return useAutorailQuery(["position", account], (c) => c.getLenderPosition(account!), !!account);
}
