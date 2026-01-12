import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { TestWallet } from "@aztec/test-wallet/server";
import { ContractFunctionInteraction } from "@aztec/aztec.js/contracts";

import {
  MeteredTokenSponsoredFeePaymentMethod,
  MeteredExactTokenSponsoredFeePaymentMethod,
  TeardownRevertTokenSponsoredFeePaymentMethod,
} from "../fee-payment-methods/token.js";

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
export function buildTokenSponsoredFeePaymentMethod(args: {
  kind: TokenSponsorshipKind;
  feePayer: AztecAddress;
  tokenAddress: AztecAddress;
  nonce: Fr;
}): FeePaymentMethod {
  switch (args.kind) {
    case "metered":
      return new MeteredTokenSponsoredFeePaymentMethod(
        args.feePayer,
        args.tokenAddress,
        args.nonce,
      );
    case "metered_exact":
      return new MeteredExactTokenSponsoredFeePaymentMethod(
        args.feePayer,
        args.tokenAddress,
        args.nonce,
      );
    case "teardown_revert_metered":
      return new TeardownRevertTokenSponsoredFeePaymentMethod(
        args.feePayer,
        args.tokenAddress,
        args.nonce,
      );
  }
}

/**
 * Build the token transfer action for authwit creation.
 * @param args - Configuration for the transfer
 * @returns A ContractFunctionInteraction or undefined for kinds that don't need authwit
 */
export function buildTokenSponsorshipTransferAction(args: {
  kind: TokenSponsorshipKind;
  token: TokenContract;
  wallet: TestWallet;
  from: AztecAddress;
  to: AztecAddress;
  amount: bigint;
  nonce: Fr;
}): ContractFunctionInteraction | undefined {
  const tokenWithWallet = args.token.withWallet(args.wallet);
  switch (args.kind) {
    case "metered":
      return tokenWithWallet.methods.transfer_to_public(
        args.from,
        args.to,
        args.amount,
        args.nonce,
      );
    case "metered_exact":
      return tokenWithWallet.methods.transfer_to_public_and_prepare_private_balance_increase(
        args.from,
        args.to,
        args.amount,
        args.nonce,
      );
  }
}

/**
 * Create an authorization witness for token-based fee sponsorship.
 * This authwit allows the FPC to transfer tokens from the user's account.
 * @param args - Configuration for the authwit
 * @returns An AuthWitness that authorizes the token transfer
 */
export async function createTokenSponsorshipAuthWitness(args: {
  kind: Exclude<TokenSponsorshipKind, "teardown_revert_metered">;
  wallet: TestWallet;
  token: TokenContract;
  from: AztecAddress;
  feePayer: AztecAddress;
  amount: bigint;
  nonce: Fr;
}) {
  const action = buildTokenSponsorshipTransferAction({
    kind: args.kind,
    token: args.token,
    wallet: args.wallet,
    from: args.from,
    to: args.feePayer,
    amount: args.amount,
    nonce: args.nonce,
  });

  if (!action) {
    throw new Error(`No authwit action required for kind: ${args.kind}`);
  }

  const intent = { caller: args.feePayer, action };
  return await args.wallet.createAuthWit(args.from, intent);
}
