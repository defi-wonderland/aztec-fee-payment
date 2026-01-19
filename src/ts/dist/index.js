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
 * await fpc.methods.mint(userAddress, 1_000_000_000_000n).send().wait();
 *
 * // Use sponsored payment
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0EwQkc7QUFFSCw0Q0FBNEM7QUFDNUMsT0FBTyxFQUFFLGVBQWUsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRWhGLHFDQUFxQztBQUNyQyxPQUFPLEVBQ0wsdUJBQXVCLEVBQ3ZCLDRCQUE0QixHQUM3QixNQUFNLGdDQUFnQyxDQUFDO0FBRXhDLDRCQUE0QjtBQUM1QixPQUFPO0FBQ0wsbUJBQW1CO0FBQ25CLHFCQUFxQixFQUNyQiw4QkFBOEIsRUFDOUIseUJBQXlCLEVBQ3pCLGFBQWE7QUFDYixhQUFhO0FBQ2IscUJBQXFCLEdBQ3RCLE1BQU0sa0JBQWtCLENBQUMifQ==
