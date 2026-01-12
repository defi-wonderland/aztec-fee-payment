import { Wallet } from "@aztec/aztec.js/wallet";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  UnconditionalContract,
  PerClassIdContract,
  MeteredContract,
  MeteredTokenContract,
} from "../artifacts/index.js";
/**
 * Deploys the Unconditional FPC contract.
 */
export declare function deployUnconditionalContract(
  deployer: Wallet,
): Promise<UnconditionalContract>;
/**
 * Deploys the PerClassId FPC contract.
 * @param allowedClassId - The contract class ID that is allowed to use this FPC
 */
export declare function deployPerClassIdContract(
  deployer: Wallet,
  allowedClassId: Fr,
): Promise<PerClassIdContract>;
/**
 * Deploys the Metered FPC contract.
 */
export declare function deployMeteredContract(
  deployer: Wallet,
): Promise<MeteredContract>;
/**
 * Deploys the MeteredToken FPC contract.
 * @param tokenAddress - The token address that will be accepted for payment
 */
export declare function deployMeteredTokenContract(
  deployer: Wallet,
  tokenAddress: AztecAddress,
): Promise<MeteredTokenContract>;
//# sourceMappingURL=deploy.d.ts.map
