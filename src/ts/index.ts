/**
 * @defi-wonderland/aztec-fee-payment
 *
 * Fee Payment Contracts (FPCs) for Aztec - enables metered fee payment strategies.
 *
 * @example
 * ```typescript
 * import {
 *   MeteredFPCContract,
 *   FPCFeePaymentMethod,
 *   MeteredMintAndPayFeePaymentMethod,
 *   deployMeteredFPCContract,
 * } from '@defi-wonderland/aztec-fee-payment';
 *
 * // Deploy FPC with owner address
 * const fpc = await deployMeteredFPCContract(wallet, ownerAddress);
 *
 * // Option 1: Pre-mint balance and use FPCFeePaymentMethod
 * // (requires authwit from the owner's account contract)
 * await fpc.methods.mint(userAddress, amount, secret)
 *   .with({ authWitnesses: [authWitness] })
 *   .send();
 *
 * await someContract.methods.doSomething()
 *   .send({
 *     fee: { paymentMethod: new FPCFeePaymentMethod(fpc.address) }
 *   });
 * // Option 2: Mint and pay fee in one transaction
 * const paymentMethod = new MeteredMintAndPayFeePaymentMethod(
 *   fpc.address, userAddress, amount, secret, authWitness
 * );
 * await someContract.methods.doSomething()
 *   .send({ fee: { paymentMethod } });
 * ```
 */

// Contract artifacts and type-safe wrappers
export {
  MeteredFPCContract,
  MeteredFPCContractArtifact,
} from "../artifacts/MeteredFPC.js";
export {
  BridgedFPCContract,
  BridgedFPCContractArtifact,
} from "../artifacts/BridgedFPC.js";

// Fee payment method implementations
export {
  FPCFeePaymentMethod,
  FPCExactFeePaymentMethod,
  MeteredMintAndPayFeePaymentMethod,
  MeteredMintThenPayFeePaymentMethod,
  BridgedMintAndPayFeePaymentMethod,
} from "./fee-payment-methods/index.js";

// Utilities for integrators
export {
  // Gas calculations
  DEFAULT_FEE_MULTIPLIER,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
  // Deployment
  deployMeteredFPCContract,
  registerBridgedContract,
} from "./utils/index.js";
