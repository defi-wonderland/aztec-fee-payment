import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { TestWallet } from "@aztec/test-wallet/server";

/**
 * Create an authorization witness for MeteredToken fee payment.
 * This authwit allows the FPC to transfer tokens from the user's account.
 * Use with MeteredTokenFeePaymentMethod (no refunds).
 */
export async function createMeteredTokenAuthWitness(args: {
  wallet: TestWallet;
  token: TokenContract;
  from: AztecAddress;
  fpcAddress: AztecAddress;
  amount: bigint;
  nonce: Fr;
}) {
  const action = args.token
    .withWallet(args.wallet)
    .methods.transfer_to_public(
      args.from,
      args.fpcAddress,
      args.amount,
      args.nonce,
    );

  const intent = { caller: args.fpcAddress, action };
  return await args.wallet.createAuthWit(args.from, intent);
}

/**
 * Create an authorization witness for MeteredToken exact fee payment.
 * This authwit allows the FPC to transfer tokens and prepare a refund.
 * Use with MeteredTokenExactFeePaymentMethod (with refunds in teardown).
 */
export async function createMeteredTokenExactAuthWitness(args: {
  wallet: TestWallet;
  token: TokenContract;
  from: AztecAddress;
  fpcAddress: AztecAddress;
  amount: bigint;
  nonce: Fr;
}) {
  const action = args.token
    .withWallet(args.wallet)
    .methods.transfer_to_public_and_prepare_private_balance_increase(
      args.from,
      args.fpcAddress,
      args.amount,
      args.nonce,
    );

  const intent = { caller: args.fpcAddress, action };
  return await args.wallet.createAuthWit(args.from, intent);
}
