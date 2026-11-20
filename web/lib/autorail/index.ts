import type { AutorailClient } from "./client";
import { MockAutorailClient } from "./mock";
import { OnchainAutorailClient } from "./onchain";

export const AUTORAIL_MODE: "mock" | "onchain" = process.env.NEXT_PUBLIC_AUTORAIL_MODE === "onchain" ? "onchain" : "mock";

let client: AutorailClient | undefined;

/** Singleton client chosen by NEXT_PUBLIC_AUTORAIL_MODE. */
export function getAutorailClient(): AutorailClient {
  client ??= AUTORAIL_MODE === "onchain" ? new OnchainAutorailClient() : new MockAutorailClient();
  return client;
}

export type { AutorailClient } from "./client";
export * from "./types";
export * from "./format";
export * from "./errors";
