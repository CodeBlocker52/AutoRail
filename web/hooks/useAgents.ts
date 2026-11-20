"use client";
import { useAutorailQuery } from "./useClient";

export function useAgents() {
  return useAutorailQuery(["agents"], (c) => c.getAgents());
}
