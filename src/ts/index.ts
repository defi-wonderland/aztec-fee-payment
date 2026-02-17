/**
 * @defi-wonderland/aztec-fee-payment
 *
 * Fee Payment Contracts (FPCs) for Aztec - enables metered fee payment strategies.
 *
 * @example
 * ```typescript
 * import {
 *   MeteredContract,
 *   MeteredFeePaymentMethod,
 *   deployMeteredContract,
 * } from '@defi-wonderland/aztec-fee-payment';
 *
 * // Deploy FPC
 * const fpc = await deployMeteredContract(wallet);
 *
 * // Mint balance for user
 * await fpc.methods.mint(userAddress, 1_000_000_000_000n).send();
 *
 * // Use sponsored payment
 * await someContract.methods.doSomething()
 *   .send({
 *     fee: { paymentMethod: new MeteredFeePaymentMethod(fpc.address) }
 *   })
 *   ;
 * ```
 */

// Contract artifacts and type-safe wrappers
export {
  MeteredContract,
  MeteredContractArtifact,
} from "../artifacts/Metered.js";

// Fee payment method implementations
export {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
} from "./fee-payment-methods/index.js";

// Utilities for integrators
export {
  // Gas calculations
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
  // Deployment
  deployMeteredContract,
} from "./utils/index.js";
