import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { TestWallet } from "@aztec/test-wallet/server";

import {
  MeteredTokenSponsoredFeePaymentMethod,
  MeteredExactTokenSponsoredFeePaymentMethod,
  TeardownRevertTokenSponsoredFeePaymentMethod,
} from "./sponsored_fee_payment.js";

export type TokenSponsorshipKind =
  | "metered"
  | "metered_exact"
  | "teardown_revert_metered"
  | "teardown_revert_metered_exact";

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
    case "teardown_revert_metered_exact":
      return new TeardownRevertMeteredExactTokenSponsoredFeePaymentMethod(
        args.feePayer,
        args.tokenAddress,
        args.nonce,
      );
  }
}

export function buildTokenSponsorshipTransferAction(args: {
  kind: TokenSponsorshipKind;
  token: TokenContract;
  wallet: TestWallet;
  from: AztecAddress;
  to: AztecAddress;
  amount: bigint;
  nonce: Fr;
}) {
  const tokenWithWallet = args.token.withWallet(args.wallet);
  switch (args.kind) {
    case "metered":
    case "teardown_revert_metered":
      return tokenWithWallet.methods.transfer_to_public(
        args.from,
        args.to,
        args.amount,
        args.nonce,
      );
    case "metered_exact":
    case "teardown_revert_metered_exact":
      return tokenWithWallet.methods.transfer_to_public_and_prepare_private_balance_increase(
        args.from,
        args.to,
        args.amount,
        args.nonce,
      );
  }
}

export async function createTokenSponsorshipAuthWitness(args: {
  kind: TokenSponsorshipKind;
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

  const intent = { caller: args.feePayer, action };
  return await args.wallet.createAuthWit(args.from, intent);
}
