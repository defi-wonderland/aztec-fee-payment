/**
 * EVM Integration Layer
 */

export { MultiChainEVMClient, type EVMClient } from "./client.js";
export {
  validateTransaction,
  type ValidateTransactionOptions,
} from "./validator.js";
export { parseTransferEvents, findFeeCollectorTransfers } from "./parser.js";
