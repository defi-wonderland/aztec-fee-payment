/**
 * @defi-wonderland/aztec-fee-payment
 *
 * Fee Payment Contracts (FPCs) for Aztec - enables various fee payment strategies.
 *
 * @example
 * ```typescript
 * import {
 *   UnconditionalContract,
 *   UnconditionalFeePaymentMethod,
 * } from '@defi-wonderland/aztec-fee-payment';
 *
 * // Deploy FPC
 * const fpc = await UnconditionalContract.deploy(wallet).send().deployed();
 *
 * // Use sponsored payment (free for user)
 * await someContract.methods.doSomething()
 *   .send({
 *     fee: { paymentMethod: new UnconditionalFeePaymentMethod(fpc.address) }
 *   })
 *   .wait();
 * ```
 */

// Contract artifacts and type-safe wrappers
export {
  UnconditionalContract,
  UnconditionalContractArtifact,
  PerClassIdContract,
  PerClassIdContractArtifact,
  MeteredContract,
  MeteredContractArtifact,
  MeteredTokenContract,
  MeteredTokenContractArtifact,
} from "./artifacts/index.js";

// Fee payment method implementations
export {
  UnconditionalFeePaymentMethod,
  PerClassIdFeePaymentMethod,
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredTokenFeePaymentMethod,
  MeteredTokenExactFeePaymentMethod,
} from "./fee-payment-methods/index.js";

// Utilities for integrators
export {
  // Gas calculations
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
  // Token sponsorship helpers
  createMeteredTokenAuthWitness,
  createMeteredTokenExactAuthWitness,
  // Deployment
  deployUnconditionalContract,
  deployPerClassIdContract,
  deployMeteredContract,
  deployMeteredTokenContract,
} from "./utils/index.js";
