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
export {
  UnconditionalFeePaymentMethod,
  PerClassIdFeePaymentMethod,
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredTokenFeePaymentMethod,
  MeteredTokenExactFeePaymentMethod,
} from "./fee-payment-methods/index.js";
export {
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
  createMeteredTokenAuthWitness,
  createMeteredTokenExactAuthWitness,
  deployUnconditionalContract,
  deployPerClassIdContract,
  deployMeteredContract,
  deployMeteredTokenContract,
} from "./utils/index.js";
//# sourceMappingURL=index.d.ts.map
