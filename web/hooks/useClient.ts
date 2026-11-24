"use client";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import { getAutorailClient, type AutorailClient } from "@/lib/autorail";
import { POLL_INTERVAL_MS } from "@/lib/chain/aevum";
import { useMode } from "./useMode";

export const AUTORAIL_KEY = "autorail";

export function useClient(): AutorailClient {
  return getAutorailClient(useMode().mode);
}

/** Query wrapper: every hook goes through the AutorailClient, polling only in onchain mode. */
export function useAutorailQuery<T>(key: QueryKey, fn: (c: AutorailClient) => Promise<T>, enabled = true) {
  const client = useClient();
  return useQuery({
    queryKey: [AUTORAIL_KEY, client.mode, ...key],
    queryFn: () => fn(client),
    enabled,
    refetchInterval: client.mode === "onchain" ? POLL_INTERVAL_MS : false,
  });
}
