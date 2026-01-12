// Gas calculation utilities
export {
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
} from "./gas.js";

// Authorization witness utilities for token-based fee payment
export {
  buildTokenSponsoredFeePaymentMethod,
  buildTokenSponsorshipTransferAction,
  createTokenSponsorshipAuthWitness,
} from "./authwit.js";

// Types
export type { TokenSponsorshipKind } from "./authwit.js";

// Deployment utilities
export { deployFeePaymentContract } from "./deploy.js";
