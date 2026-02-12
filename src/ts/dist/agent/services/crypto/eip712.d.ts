import { type Address, type Hex } from "viem";
export interface ClaimRequestMessage {
  txHash: Hex;
}
/**
 * Recover the signer address from an EIP-712 ClaimRequest signature.
 */
export declare function recoverClaimRequestSigner(
  message: ClaimRequestMessage,
  signature: Hex,
  chainId: number,
): Promise<Address>;
/**
 * Returns the typed data object for client-side signing.
 */
export declare function getTypedDataForSigning(
  txHash: Hex,
  chainId: number,
): {
  domain: {
    chainId: number;
    name: "Aztec FPC Claim";
    version: "1";
  };
  types: {
    readonly ClaimRequest: readonly [
      {
        readonly name: "txHash";
        readonly type: "bytes32";
      },
    ];
  };
  primaryType: "ClaimRequest";
  message: {
    txHash: `0x${string}`;
  };
};
//# sourceMappingURL=eip712.d.ts.map
