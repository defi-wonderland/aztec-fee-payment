/**
 * @defi-wonderland/aztec-fee-payment
 *
 * Fee Payment Contract (FPC) for Aztec - enables sponsored and metered transaction fee payments.
 *
 * @example
 * ```typescript
 * import {
 *   FeePaymentContract,
 *   SponsoredFeePaymentMethod,
 *   MeteredTokenSponsoredFeePaymentMethod,
 *   createTokenSponsorshipAuthWitness
 * } from '@defi-wonderland/aztec-fee-payment';
 *
 * // Deploy FPC
 * const fpc = await FeePaymentContract.deploy(wallet).send().deployed();
 *
 * // Use sponsored payment (free for user)
 * await someContract.methods.doSomething()
 *   .send({
 *     fee: { paymentMethod: new SponsoredFeePaymentMethod(fpc.address) }
 *   })
 *   .wait();
 * ```
 */
export {
  FeePaymentContract,
  FeePaymentContractArtifact,
} from "./artifacts/index.js";
export {
  SponsoredFeePaymentMethod,
  ClassIdValidatedSponsoredFeePaymentMethod,
  TeardownRevertSponsoredFeePaymentMethod,
  MeteredSponsoredFeePaymentMethod,
  MeteredExactSponsoredFeePaymentMethod,
  TeardownRevertMeteredSponsoredFeePaymentMethod,
  MeteredTokenSponsoredFeePaymentMethod,
  MeteredExactTokenSponsoredFeePaymentMethod,
  TeardownRevertTokenSponsoredFeePaymentMethod,
} from "./fee-payment-methods/index.js";
export {
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
  buildTokenSponsoredFeePaymentMethod,
  buildTokenSponsorshipTransferAction,
  createTokenSponsorshipAuthWitness,
  deployFeePaymentContract,
} from "./utils/index.js";
export type { TokenSponsorshipKind } from "./utils/index.js";
//# sourceMappingURL=index.d.ts.map
