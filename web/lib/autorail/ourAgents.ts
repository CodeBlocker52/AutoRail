import { DEPLOYMENTS } from "./generated/deployments";
import { TARGET_CHAIN_ID } from "../chain/aevum";

const agents = (DEPLOYMENTS as unknown as Record<number, { agents: Record<string, number> } | undefined>)[TARGET_CHAIN_ID]?.agents ?? {};
/** Our "Frontier Lab" buyer agent (ERC-8004 #1): auto-confirms and auto-pays onboarded vendors' small invoices. */
export const OUR_LAB_AGENT_ID: number = agents["frontier-lab"] ?? 1;
/** Max invoice Frontier Lab auto-confirms and auto-pays (0.10 tUSD8). */
export const LAB_AUTO_MAX = 100_000n;
