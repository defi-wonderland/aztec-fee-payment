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
 * // Deploy FPC (wallet becomes the owner/Service Provider)
 * const fpc = await deployMeteredContract(wallet);
 *
 * // Mint balance: obtain authwit from off-chain agent, then call mint
 * const { amount, secret, authwit } = await agent.requestAuthwit(evmTxHash);
 * await wallet.addAuthWitness(authwit);
 * // Use MeteredMintFeePaymentMethod to self-sponsor the mint transaction
 *
 * // Use sponsored payment (after user has wFJ balance)
 * await someContract.methods.doSomething()
 *   .send({
 *     fee: { paymentMethod: new MeteredFeePaymentMethod(fpc.address) }
 *   })
 *   .wait();
 * ```
 */

// Contract artifacts and type-safe wrappers
export { MeteredContract, MeteredContractArtifact } from "./artifacts/index.js";

// Fee payment method implementations
export {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredMintFeePaymentMethod,
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
