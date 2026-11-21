import { domainSeparator, type Address, type PublicClient } from "viem";

const DS_ABI = [{ type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] }] as const;
const cache = new Map<string, number>();

/**
 * tUSD8 (FiatToken v2.2, name "tUSD8", version "2") EIP-712 domain. The chain id is read back from the token's
 * DOMAIN_SEPARATOR: on a local fork the token may keep the 44005 separator.
 */
export async function tusd8Domain(client: PublicClient, token: Address, chainId: number) {
  const key = `${token}:${chainId}`;
  if (!cache.has(key)) {
    const ds = await client.readContract({ address: token, abi: DS_ABI, functionName: "DOMAIN_SEPARATOR" });
    const sep = (id: number) => domainSeparator({ domain: { name: "tUSD8", version: "2", chainId: id, verifyingContract: token } });
    cache.set(key, ds === sep(chainId) ? chainId : 44005);
  }
  return { name: "tUSD8", version: "2", chainId: cache.get(key)!, verifyingContract: token } as const;
}

export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const RECEIVE_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export const CONFIRMATION_TYPES = {
  Confirmation: [
    { name: "id", type: "bytes32" },
    { name: "invoiceHash", type: "bytes32" },
    { name: "seller", type: "address" },
    { name: "buyer", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "dueDate", type: "uint64" },
    { name: "payee", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
