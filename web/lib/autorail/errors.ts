import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";
import type { Hash } from "viem";

/** Custom-error names emitted by the Autorail contracts, plus client-side conditions. */
export type AutorailErrorCode =
  | "PayeeNotAllowed"
  | "OverPerTxCap"
  | "OverTotalCap"
  | "SessionExpired"
  | "SessionRevoked"
  | "NotConfirmed"
  | "DuplicateInvoice"
  | "SelfDealing"
  | "UserRejected"
  | "InsufficientBalance"
  | "InsufficientLiquidity"
  | "InvalidState"
  | "AdvanceTooHigh"
  | "NotImplemented"
  | "Unknown";

export const ERROR_MESSAGES: Record<AutorailErrorCode, string> = {
  PayeeNotAllowed: "This payee isn't on the job's approved list.",
  OverPerTxCap: "This payment is above the session's per-payment limit.",
  OverTotalCap: "This would exceed the session's total budget.",
  SessionExpired: "This session key has expired.",
  SessionRevoked: "This session key was revoked by the vendor.",
  NotConfirmed: "The buyer hasn't confirmed this invoice yet.",
  DuplicateInvoice: "This invoice was already submitted.",
  SelfDealing: "Seller and buyer can't be the same agent.",
  UserRejected: "You cancelled the signature.",
  InsufficientBalance: "Your tUSD8 balance is too low for this amount.",
  InsufficientLiquidity: "The vault doesn't have enough idle tUSD8 for this.",
  InvalidState: "This action isn't available in the invoice's current state.",
  AdvanceTooHigh: "The requested advance is above the 80% cap or the vendor's limit.",
  NotImplemented: "This action isn't wired to the contracts yet.",
  Unknown: "Something went wrong. Check the transaction on the explorer.",
};

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

/** Turn anything thrown by a write (mock, viem, wallet) into a plain-English error. */
export function decodeError(e: unknown): DecodedError {
  if (e instanceof AutorailError) return { code: e.code, message: e.message, txHash: e.txHash };
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return { code: "UserRejected", message: ERROR_MESSAGES.UserRejected };
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? "";
      if (isCode(name)) return { code: name, message: ERROR_MESSAGES[name], raw: e.shortMessage };
    }
    return { code: "Unknown", message: ERROR_MESSAGES.Unknown, raw: e.shortMessage };
  }
  const anyE = e as { code?: number; message?: string } | undefined;
  if (anyE?.code === 4001 || /user (rejected|denied)/i.test(anyE?.message ?? "")) return { code: "UserRejected", message: ERROR_MESSAGES.UserRejected };
  return { code: "Unknown", message: ERROR_MESSAGES.Unknown, raw: anyE?.message };
}

export const revertMessage = (code: AutorailErrorCode) => ERROR_MESSAGES[code];
