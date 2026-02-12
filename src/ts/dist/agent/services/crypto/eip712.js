import { recoverTypedDataAddress } from "viem";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWlwNzEyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vYWdlbnQvc2VydmljZXMvY3J5cHRvL2VpcDcxMi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsdUJBQXVCLEVBQTBCLE1BQU0sTUFBTSxDQUFDO0FBRXZFLE1BQU0sYUFBYSxHQUFHO0lBQ3BCLElBQUksRUFBRSxpQkFBaUI7SUFDdkIsT0FBTyxFQUFFLEdBQUc7Q0FDSixDQUFDO0FBRVgsTUFBTSxZQUFZLEdBQUc7SUFDbkIsWUFBWSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsQ0FBQztDQUMzQyxDQUFDO0FBTVg7O0dBRUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLHlCQUF5QixDQUM3QyxPQUE0QixFQUM1QixTQUFjLEVBQ2QsT0FBZTtJQUVmLE9BQU8sdUJBQXVCLENBQUM7UUFDN0IsTUFBTSxFQUFFLEVBQUUsR0FBRyxhQUFhLEVBQUUsT0FBTyxFQUFFO1FBQ3JDLEtBQUssRUFBRSxZQUFZO1FBQ25CLFdBQVcsRUFBRSxjQUFjO1FBQzNCLE9BQU87UUFDUCxTQUFTO0tBQ1YsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLHNCQUFzQixDQUFDLE1BQVcsRUFBRSxPQUFlO0lBQ2pFLE9BQU87UUFDTCxNQUFNLEVBQUUsRUFBRSxHQUFHLGFBQWEsRUFBRSxPQUFPLEVBQUU7UUFDckMsS0FBSyxFQUFFLFlBQVk7UUFDbkIsV0FBVyxFQUFFLGNBQXVCO1FBQ3BDLE9BQU8sRUFBRSxFQUFFLE1BQU0sRUFBRTtLQUNwQixDQUFDO0FBQ0osQ0FBQyJ9
