import { recoverTypedDataAddress, type Address, type Hex } from "viem";

const EIP712_DOMAIN = {
  name: "Aztec FPC Claim",
  version: "1",
} as const;

const EIP712_TYPES = {
  ClaimRequest: [{ name: "txHash", type: "bytes32" }],
} as const;

export interface ClaimRequestMessage {
  txHash: Hex;
}

/**
 * Recover the signer address from an EIP-712 ClaimRequest signature.
 */
export async function recoverClaimRequestSigner(
  message: ClaimRequestMessage,
  signature: Hex,
  chainId: number,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain: { ...EIP712_DOMAIN, chainId },
    types: EIP712_TYPES,
    primaryType: "ClaimRequest",
    message,
    signature,
  });
}

/**
 * Returns the typed data object for client-side signing.
 */
export function getTypedDataForSigning(txHash: Hex, chainId: number) {
  return {
    domain: { ...EIP712_DOMAIN, chainId },
    types: EIP712_TYPES,
    primaryType: "ClaimRequest" as const,
    message: { txHash },
  };
}
