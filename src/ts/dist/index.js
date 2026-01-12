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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXNCRztBQUVILDRDQUE0QztBQUM1QyxPQUFPLEVBQ0wscUJBQXFCLEVBQ3JCLDZCQUE2QixFQUM3QixrQkFBa0IsRUFDbEIsMEJBQTBCLEVBQzFCLGVBQWUsRUFDZix1QkFBdUIsRUFDdkIsb0JBQW9CLEVBQ3BCLDRCQUE0QixHQUM3QixNQUFNLHNCQUFzQixDQUFDO0FBRTlCLHFDQUFxQztBQUNyQyxPQUFPLEVBQ0wsNkJBQTZCLEVBQzdCLDBCQUEwQixFQUMxQix1QkFBdUIsRUFDdkIsNEJBQTRCLEVBQzVCLDRCQUE0QixFQUM1QixpQ0FBaUMsR0FDbEMsTUFBTSxnQ0FBZ0MsQ0FBQztBQUV4Qyw0QkFBNEI7QUFDNUIsT0FBTztBQUNMLG1CQUFtQjtBQUNuQixxQkFBcUIsRUFDckIsOEJBQThCLEVBQzlCLHlCQUF5QixFQUN6QixhQUFhO0FBQ2IsNEJBQTRCO0FBQzVCLDZCQUE2QixFQUM3QixrQ0FBa0M7QUFDbEMsYUFBYTtBQUNiLDJCQUEyQixFQUMzQix3QkFBd0IsRUFDeEIscUJBQXFCLEVBQ3JCLDBCQUEwQixHQUMzQixNQUFNLGtCQUFrQixDQUFDIn0=
