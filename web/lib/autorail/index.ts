import type { AutorailClient } from "./client";
import { MockAutorailClient } from "./mock";
import { OnchainAutorailClient } from "./onchain";
import { currentMode, type AppMode } from "./mode";

const clients: Partial<Record<AppMode, AutorailClient>> = {};

/** One client per mode (Live = onchain, Demo data = mock). The mode comes from ModeProvider at runtime. */
export function getAutorailClient(mode: AppMode = currentMode()): AutorailClient {
  return (clients[mode] ??= mode === "onchain" ? new OnchainAutorailClient() : new MockAutorailClient());
}

export { currentMode, DEFAULT_MODE, resolveMode, switchMode, type AppMode } from "./mode";
export type { AutorailClient } from "./client";
export * from "./types";
export * from "./format";
export * from "./errors";
