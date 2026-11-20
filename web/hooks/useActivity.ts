"use client";
import type { ActivityFilter } from "@/lib/autorail";
import { useAutorailQuery } from "./useClient";

export function useActivity(filter: ActivityFilter = {}) {
  return useAutorailQuery(["activity", filter], (c) => c.getActivity(filter));
}
