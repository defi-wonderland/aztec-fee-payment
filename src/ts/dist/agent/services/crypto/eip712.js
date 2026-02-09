import { recoverTypedDataAddress, verifyTypedData } from "viem";
const EIP712_DOMAIN = {
  name: "Aztec FPC Claim",
  version: "1",
};
const EIP712_TYPES = {
  ClaimRequest: [{ name: "txHash", type: "bytes32" }],
};
/**
 * Recover the signer address from an EIP-712 ClaimRequest signature.
 */
export async function recoverClaimRequestSigner(message, signature, chainId) {
  return recoverTypedDataAddress({
    domain: { ...EIP712_DOMAIN, chainId },
    types: EIP712_TYPES,
    primaryType: "ClaimRequest",
    message,
    signature,
  });
}
/**
 * Verify that an EIP-712 ClaimRequest signature was produced by `expectedSigner`.
 */
export async function verifyClaimRequestSignature(
  message,
  signature,
  expectedSigner,
  chainId,
) {
  return verifyTypedData({
    domain: { ...EIP712_DOMAIN, chainId },
    types: EIP712_TYPES,
    primaryType: "ClaimRequest",
    message,
    signature,
    address: expectedSigner,
  });
}
/**
 * Returns the typed data object for client-side signing.
 */
export function getTypedDataForSigning(txHash, chainId) {
  return {
    domain: { ...EIP712_DOMAIN, chainId },
    types: EIP712_TYPES,
    primaryType: "ClaimRequest",
    message: { txHash },
  };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWlwNzEyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vYWdlbnQvc2VydmljZXMvY3J5cHRvL2VpcDcxMi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0wsdUJBQXVCLEVBQ3ZCLGVBQWUsR0FHaEIsTUFBTSxNQUFNLENBQUM7QUFFZCxNQUFNLGFBQWEsR0FBRztJQUNwQixJQUFJLEVBQUUsaUJBQWlCO0lBQ3ZCLE9BQU8sRUFBRSxHQUFHO0NBQ0osQ0FBQztBQUVYLE1BQU0sWUFBWSxHQUFHO0lBQ25CLFlBQVksRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUM7Q0FDM0MsQ0FBQztBQU1YOztHQUVHO0FBQ0gsTUFBTSxDQUFDLEtBQUssVUFBVSx5QkFBeUIsQ0FDN0MsT0FBNEIsRUFDNUIsU0FBYyxFQUNkLE9BQWU7SUFFZixPQUFPLHVCQUF1QixDQUFDO1FBQzdCLE1BQU0sRUFBRSxFQUFFLEdBQUcsYUFBYSxFQUFFLE9BQU8sRUFBRTtRQUNyQyxLQUFLLEVBQUUsWUFBWTtRQUNuQixXQUFXLEVBQUUsY0FBYztRQUMzQixPQUFPO1FBQ1AsU0FBUztLQUNWLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsMkJBQTJCLENBQy9DLE9BQTRCLEVBQzVCLFNBQWMsRUFDZCxjQUF1QixFQUN2QixPQUFlO0lBRWYsT0FBTyxlQUFlLENBQUM7UUFDckIsTUFBTSxFQUFFLEVBQUUsR0FBRyxhQUFhLEVBQUUsT0FBTyxFQUFFO1FBQ3JDLEtBQUssRUFBRSxZQUFZO1FBQ25CLFdBQVcsRUFBRSxjQUFjO1FBQzNCLE9BQU87UUFDUCxTQUFTO1FBQ1QsT0FBTyxFQUFFLGNBQWM7S0FDeEIsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLHNCQUFzQixDQUFDLE1BQVcsRUFBRSxPQUFlO0lBQ2pFLE9BQU87UUFDTCxNQUFNLEVBQUUsRUFBRSxHQUFHLGFBQWEsRUFBRSxPQUFPLEVBQUU7UUFDckMsS0FBSyxFQUFFLFlBQVk7UUFDbkIsV0FBVyxFQUFFLGNBQXVCO1FBQ3BDLE9BQU8sRUFBRSxFQUFFLE1BQU0sRUFBRTtLQUNwQixDQUFDO0FBQ0osQ0FBQyJ9
