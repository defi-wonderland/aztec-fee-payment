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

// Contract artifact and type-safe wrapper
export {
  FeePaymentContract,
  FeePaymentContractArtifact,
} from "./artifacts/index.js";

// Fee payment method implementations
export {
  // Sponsored (unconditional)
  SponsoredFeePaymentMethod,
  ClassIdValidatedSponsoredFeePaymentMethod,
  TeardownRevertSponsoredFeePaymentMethod,
  // Metered (internal balance tracking)
  MeteredSponsoredFeePaymentMethod,
  MeteredExactSponsoredFeePaymentMethod,
  TeardownRevertMeteredSponsoredFeePaymentMethod,
  // Token-based (ERC20-like payments)
  MeteredTokenSponsoredFeePaymentMethod,
  MeteredExactTokenSponsoredFeePaymentMethod,
  TeardownRevertTokenSponsoredFeePaymentMethod,
} from "./fee-payment-methods/index.js";

// Utilities for integrators
export {
  // Gas calculations
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
  // Token sponsorship helpers
  buildTokenSponsoredFeePaymentMethod,
  buildTokenSponsorshipTransferAction,
  createTokenSponsorshipAuthWitness,
  // Deployment
  deployFeePaymentContract,
} from "./utils/index.js";

// Types
export type { TokenSponsorshipKind } from "./utils/index.js";
