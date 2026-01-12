import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { TestWallet } from "@aztec/test-wallet/server";
import { ContractFunctionInteraction } from "@aztec/aztec.js/contracts";
/**
 * Types of token-based fee sponsorship available.
 */
export type TokenSponsorshipKind =
  | "metered"
  | "metered_exact"
  | "teardown_revert_metered";
/**
 * Build a token-based fee payment method.
 * @param args - Configuration for the payment method
 * @returns A FeePaymentMethod instance for the specified kind
 */
export declare function buildTokenSponsoredFeePaymentMethod(args: {
  kind: TokenSponsorshipKind;
  feePayer: AztecAddress;
  tokenAddress: AztecAddress;
  nonce: Fr;
}): FeePaymentMethod;
/**
 * Build the token transfer action for authwit creation.
 * @param args - Configuration for the transfer
 * @returns A ContractFunctionInteraction or undefined for kinds that don't need authwit
 */
export declare function buildTokenSponsorshipTransferAction(args: {
  kind: TokenSponsorshipKind;
  token: TokenContract;
  wallet: TestWallet;
  from: AztecAddress;
  to: AztecAddress;
  amount: bigint;
  nonce: Fr;
}): ContractFunctionInteraction | undefined;
/**
 * Create an authorization witness for token-based fee sponsorship.
 * This authwit allows the FPC to transfer tokens from the user's account.
 * @param args - Configuration for the authwit
 * @returns An AuthWitness that authorizes the token transfer
 */
export declare function createTokenSponsorshipAuthWitness(args: {
  kind: Exclude<TokenSponsorshipKind, "teardown_revert_metered">;
  wallet: TestWallet;
  token: TokenContract;
  from: AztecAddress;
  feePayer: AztecAddress;
  amount: bigint;
  nonce: Fr;
}): Promise<import("@aztec/stdlib/auth-witness").AuthWitness>;
//# sourceMappingURL=authwit.d.ts.map
