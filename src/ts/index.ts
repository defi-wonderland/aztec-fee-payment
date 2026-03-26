/**
 * @defi-wonderland/aztec-fee-payment
 *
 * Fee Payment Contracts (FPCs) for Aztec - enables bridged fee payment strategies.
 *
 * @example
 * ```typescript
 * import {
 *   BridgedFPCContract,
 *   FPCFeePaymentMethod,
 *   registerBridgedContract,
 * } from '@defi-wonderland/aztec-fee-payment';
 *
 * // Register (no deploy needed — fully private contract)
 * const fpc = await registerBridgedContract(wallet, salt);
 *
 * // Use FPCFeePaymentMethod after minting internal balance
 * await someContract.methods.doSomething()
 *   .send({
 *     fee: { paymentMethod: new FPCFeePaymentMethod(fpc.address) }
 *   });
 * ```
 */

// Contract artifacts and type-safe wrappers
export {
  BridgedFPCContract,
  BridgedFPCContractArtifact,
} from "../artifacts/BridgedFPC.js";

// Fee payment method implementations
export {
  FPCFeePaymentMethod,
  BridgedMintAndPayFeePaymentMethod,
} from "./fee-payment-methods/index.js";

// Utilities for integrators
export {
  // Gas calculations
  DEFAULT_FEE_MULTIPLIER,
  REASONABLE_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
  // Deployment
  registerBridgedContract,
} from "./utils/index.js";
