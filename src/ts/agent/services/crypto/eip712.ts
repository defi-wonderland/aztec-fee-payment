/**
 * EIP-712 Signature Verification
 *
 * Implements typed data signing and verification for claim requests.
 */

import {
  type Hex,
  type Address,
  recoverTypedDataAddress,
  verifyTypedData,
} from "viem";
import type { ClaimRequestMessage } from "../../types/index.js";

// EIP-712 Domain
const EIP712_DOMAIN_NAME = "Aztec FPC Claim" as const;
const EIP712_DOMAIN_VERSION = "1" as const;

// EIP-712 Types
const EIP712_TYPES = {
  ClaimRequest: [{ name: "txHash", type: "bytes32" }],
} as const;

/**
 * Create the EIP-712 domain for a specific chain
 */
export function createEIP712Domain(chainId: number) {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
  };
}

/**
 * Recover the signer address from an EIP-712 signature
 */
export async function recoverClaimRequestSigner(
  message: ClaimRequestMessage,
  signature: Hex,
  chainId: number,
): Promise<Address> {
  const address = await recoverTypedDataAddress({
    domain: createEIP712Domain(chainId),
    types: EIP712_TYPES,
    primaryType: "ClaimRequest",
    message: {
      txHash: message.txHash,
    },
    signature,
  });

  return address;
}

/**
 * Verify that a signature was created by the expected signer
 */
export async function verifyClaimRequestSignature(
  message: ClaimRequestMessage,
  signature: Hex,
  expectedSigner: Address,
  chainId: number,
): Promise<boolean> {
  const valid = await verifyTypedData({
    address: expectedSigner,
    domain: createEIP712Domain(chainId),
    types: EIP712_TYPES,
    primaryType: "ClaimRequest",
    message: {
      txHash: message.txHash,
    },
    signature,
  });

  return valid;
}

/**
 * Get the typed data for signing (client-side use)
 * This is useful for clients to construct the message to sign.
 */
export function getTypedDataForSigning(txHash: Hex, chainId: number) {
  return {
    domain: createEIP712Domain(chainId),
    types: EIP712_TYPES,
    primaryType: "ClaimRequest" as const,
    message: {
      txHash,
    },
  };
}
