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
export { MeteredContract, MeteredContractArtifact } from "./artifacts/index.js";
export {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
} from "./fee-payment-methods/index.js";
export {
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
  deployMeteredContract,
} from "./utils/index.js";
//# sourceMappingURL=index.d.ts.map
