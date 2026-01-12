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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBd0JHO0FBRUgsMENBQTBDO0FBQzFDLE9BQU8sRUFDTCxrQkFBa0IsRUFDbEIsMEJBQTBCLEdBQzNCLE1BQU0sc0JBQXNCLENBQUM7QUFFOUIscUNBQXFDO0FBQ3JDLE9BQU87QUFDTCw0QkFBNEI7QUFDNUIseUJBQXlCLEVBQ3pCLHlDQUF5QyxFQUN6Qyx1Q0FBdUM7QUFDdkMsc0NBQXNDO0FBQ3RDLGdDQUFnQyxFQUNoQyxxQ0FBcUMsRUFDckMsOENBQThDO0FBQzlDLG9DQUFvQztBQUNwQyxxQ0FBcUMsRUFDckMsMENBQTBDLEVBQzFDLDRDQUE0QyxHQUM3QyxNQUFNLGdDQUFnQyxDQUFDO0FBRXhDLDRCQUE0QjtBQUM1QixPQUFPO0FBQ0wsbUJBQW1CO0FBQ25CLHFCQUFxQixFQUNyQiw4QkFBOEIsRUFDOUIseUJBQXlCLEVBQ3pCLGFBQWE7QUFDYiw0QkFBNEI7QUFDNUIsbUNBQW1DLEVBQ25DLG1DQUFtQyxFQUNuQyxpQ0FBaUM7QUFDakMsYUFBYTtBQUNiLHdCQUF3QixHQUN6QixNQUFNLGtCQUFrQixDQUFDIn0=
