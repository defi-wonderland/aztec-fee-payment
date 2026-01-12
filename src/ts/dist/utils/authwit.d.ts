import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { TestWallet } from "@aztec/test-wallet/server";
/**
 * Create an authorization witness for MeteredToken fee payment.
 * This authwit allows the FPC to transfer tokens from the user's account.
 * Use with MeteredTokenFeePaymentMethod (no refunds).
 */
export declare function createMeteredTokenAuthWitness(args: {
  wallet: TestWallet;
  token: TokenContract;
  from: AztecAddress;
  fpcAddress: AztecAddress;
  amount: bigint;
  nonce: Fr;
}): Promise<import("@aztec/stdlib/auth-witness").AuthWitness>;
/**
 * Create an authorization witness for MeteredToken exact fee payment.
 * This authwit allows the FPC to transfer tokens and prepare a refund.
 * Use with MeteredTokenExactFeePaymentMethod (with refunds in teardown).
 */
export declare function createMeteredTokenExactAuthWitness(args: {
  wallet: TestWallet;
  token: TokenContract;
  from: AztecAddress;
  fpcAddress: AztecAddress;
  amount: bigint;
  nonce: Fr;
}): Promise<import("@aztec/stdlib/auth-witness").AuthWitness>;
//# sourceMappingURL=authwit.d.ts.map
