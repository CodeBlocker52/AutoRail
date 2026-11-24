import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, decodeErrorResult } from "viem";
import type { Abi, Hash, Hex } from "viem";
import * as generatedAbis from "./generated/abis";

/** Custom-error names emitted by the Autorail contracts, plus client-side conditions. */
export const ERROR_MESSAGES = {
  // the eight safety errors the UI was designed around
  PayeeNotAllowed: "This payee isn't on the job's approved list.",
  OverPerTxCap: "This payment is above the session's per-payment limit.",
  OverTotalCap: "This would exceed the session's total budget.",
  SessionExpired: "This session key has expired.",
  SessionRevoked: "This session key was revoked by the vendor.",
  NotConfirmed: "The buyer hasn't confirmed this invoice yet.",
  DuplicateInvoice: "This invoice was already submitted.",
  SelfDealing: "Seller and buyer can't be the same agent.",
  // every other Autorail contract error
  AdvanceTooHigh: "The requested advance is above the risk band's cap or the vendor's limit.",
  AlreadyRepaid: "This invoice has already been repaid.",
  AmountTooLarge: "That amount is too large.",
  Closed: "This JobWallet is closed (the invoice was repaid or defaulted).",
  DueDateInPast: "The due date must be in the future.",
  FeeBelowFloor: "The offer's fee is below the risk band's floor.",
  InsufficientBalance: "The balance is too low for this amount.",
  InsufficientTusd8: "Not enough tUSD8 for this step. Get tUSD8 from the faucet: https://faucet.qday.info/en",
  InsufficientGas: "Not enough tQDAY to pay gas. Get tQDAY from the faucet (https://faucet.qday.info/en) or the gas drip on the Get started page.",
  InsufficientLiquidity: "The vault doesn't have enough idle tUSD8 for this.",
  InvalidSession: "The session settings are invalid (caps, expiry or payees).",
  InvalidSignature: "The signature doesn't match the expected signer.",
  InvalidState: "This action isn't available in the invoice's current state.",
  InvalidUnderwriter: "The offer wasn't signed by a registered underwriter agent.",
  NoPayees: "The offer has no approved payees.",
  NoSession: "This key has no session on this JobWallet.",
  NotBuyer: "Only the buyer agent that confirmed the invoice can do this.",
  NotBuyerAgent: "That agent doesn't have the Buyer role.",
  NotOwner: "Only the JobWallet owner (the seller) can do this.",
  NotPayable: "This invoice can't be paid yet (it must be funded first).",
  NotSeller: "Only the seller agent can do this. Connect the seller wallet.",
  NotYet: "Too early: the grace or default period hasn't passed.",
  OfferExpired: "The underwriter's offer expired. Request a new one.",
  OfferNonceUsed: "This offer was already used.",
  OverSellerLimit: "This advance would exceed the vendor's credit limit.",
  SignatureExpired: "The signature's deadline has passed.",
  UnknownReceivable: "Unknown invoice.",
  WrongAmount: "The payment must equal the invoice amount.",
  WrongNonce: "The authorization nonce isn't bound to this invoice.",
  WrongPayee: "The confirmation must name the Autorail router as payee.",
  ZeroAmount: "Enter an amount above zero.",
  ERC4626ExceededMaxWithdraw: "That's more than you can withdraw now. Withdrawals are capped at idle liquidity.",
  ERC4626ExceededMaxRedeem: "That's more than you can redeem now. Withdrawals are capped at idle liquidity.",
  ERC20InsufficientBalance: "The tUSD8 balance is too low for this amount.",
  ERC20InsufficientAllowance: "The token allowance is too low.",
  EnforcedPause: "This contract is paused by the admin.",
  ReentrancyGuardReentrantCall: "Re-entrant call blocked.",
  // client-side / transport
  WrongChain: "Switch your wallet to QDay Aevum testnet (44005).",
  NotConnected: "Connect a wallet first.",
  UserRejected: "You cancelled the signature.",
  NotImplemented: "This action isn't wired to the contracts yet.",
  Unknown: "Something went wrong. Check the transaction on the explorer.",
} as const;

export type AutorailErrorCode = keyof typeof ERROR_MESSAGES;

/** String reverts from the real tUSD8 (FiatToken v2.2), mapped to plain English. */
const FIATTOKEN_REASONS: [RegExp, string][] = [
  [/authorization is expired/i, "The payment authorization has expired. Sign it again."],
  [/authorization is not yet valid/i, "The payment authorization isn't valid yet."],
  [/authorization is used or canceled/i, "This payment authorization was already used."],
  [/invalid signature/i, "The signature doesn't match the expected signer."],
  [/transfer amount exceeds balance/i, "The tUSD8 balance is too low for this amount."],
  [/permit is expired/i, "The permit signature expired. Try again."],
];

export class AutorailError extends Error {
  readonly code: AutorailErrorCode;
  txHash?: Hash;
  constructor(code: AutorailErrorCode, detail?: string, txHash?: Hash) {
    super(detail ? `${ERROR_MESSAGES[code]} ${detail}` : ERROR_MESSAGES[code]);
    this.name = "AutorailError";
    this.code = code;
    this.txHash = txHash;
  }
}

export interface DecodedError {
  code: AutorailErrorCode;
  message: string;
  txHash?: Hash;
  raw?: string;
}

const isCode = (s: string): s is AutorailErrorCode => s in ERROR_MESSAGES;

let errorAbiCache: Abi | null = null;
/** Every custom error in the deployed contracts (from the generated ABIs). */
function errorAbi(): Abi {
  if (!errorAbiCache) {
    errorAbiCache = Object.values(generatedAbis)
      .flat()
      .filter((x) => (x as { type: string }).type === "error") as unknown as Abi;
  }
  return errorAbiCache;
}

/** Decode raw revert data (0x + selector + args) into an error name, using the generated ABIs. */
export function decodeRevertData(data: Hex | undefined): { name: string; args?: readonly unknown[] } | null {
  if (!data || data.length < 10) return null;
  try {
    const r = decodeErrorResult({ abi: errorAbi(), data });
    return { name: r.errorName, args: r.args as readonly unknown[] | undefined };
  } catch {
    return null;
  }
}

function fromName(name: string, extra: Partial<DecodedError> = {}): DecodedError | null {
  if (isCode(name)) return { code: name, message: ERROR_MESSAGES[name], ...extra };
  return null;
}

function fromReason(text: string | undefined, extra: Partial<DecodedError> = {}): DecodedError | null {
  if (!text) return null;
  for (const [re, msg] of FIATTOKEN_REASONS) if (re.test(text)) return { code: "Unknown", message: msg, raw: text, ...extra };
  return null;
}

/** Turn anything thrown by a write (mock, viem, wallet, our API routes) into a plain-English error. */
export function decodeError(e: unknown): DecodedError {
  if (e instanceof AutorailError) return { code: e.code, message: e.message, txHash: e.txHash };
  // payloads returned by our API routes: { code, message, txHash? }
  const payload = e as { code?: unknown; message?: unknown; txHash?: Hash; data?: Hex } | undefined;
  if (payload && typeof payload.code === "string" && isCode(payload.code)) {
    return { code: payload.code, message: typeof payload.message === "string" ? payload.message : ERROR_MESSAGES[payload.code], txHash: payload.txHash };
  }
  // other API refusals (RateLimited, Preflight, NotConfigured…): keep the server's plain-English message
  if (!(e instanceof Error) && payload && typeof payload.code === "string" && typeof payload.message === "string") {
    return { code: "Unknown", message: payload.message, txHash: payload.txHash, raw: payload.code };
  }
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return { code: "UserRejected", message: ERROR_MESSAGES.UserRejected };
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const hit = fromName(reverted.data?.errorName ?? "", { raw: e.shortMessage });
      if (hit) return hit;
      const raw = decodeRevertData(reverted.raw);
      const hit2 = raw && fromName(raw.name, { raw: e.shortMessage });
      if (hit2) return hit2;
      const reason = fromReason(reverted.reason ?? e.shortMessage);
      if (reason) return reason;
    }
    // revert data nested anywhere in the cause chain
    const withData = e.walk((x) => typeof (x as { data?: unknown }).data === "string") as { data?: Hex } | null;
    const raw = decodeRevertData(withData?.data);
    const hit = raw && fromName(raw.name, { raw: e.shortMessage });
    if (hit) return hit;
    const reason = fromReason(e.details ?? e.shortMessage);
    if (reason) return reason;
    if (/chain mismatch|does not match the target chain/i.test(e.message)) return { code: "WrongChain", message: ERROR_MESSAGES.WrongChain };
    return { code: "Unknown", message: ERROR_MESSAGES.Unknown, raw: e.shortMessage };
  }
  const anyE = e as { code?: number; message?: string } | undefined;
  if (anyE?.code === 4001 || /user (rejected|denied)/i.test(anyE?.message ?? "")) return { code: "UserRejected", message: ERROR_MESSAGES.UserRejected };
  const raw = decodeRevertData(payload?.data);
  const hit = raw && fromName(raw.name);
  if (hit) return hit;
  return fromReason(anyE?.message) ?? { code: "Unknown", message: ERROR_MESSAGES.Unknown, raw: anyE?.message };
}

export const revertMessage = (code: AutorailErrorCode) => ERROR_MESSAGES[code];
