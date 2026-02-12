import type { Address, Hex, Log } from "viem";
import type { AgentConfig } from "../types/index.js";
import type { EVMClient } from "../services/evm/client.js";
import type { ValidateTransactionOptions } from "../services/evm/validator.js";
import pino from "pino";
export declare const TEST_KEY: Hex;
export declare const OTHER_KEY: Hex;
export declare const FEE_COLLECTOR: Address;
export declare const AZT_TOKEN: Address;
export declare const USER: Address;
export declare const TX_HASH: Hex;
export declare const FPC_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
export declare const OWNER_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000002";
export declare const CHAIN_ID = 84532;
export declare const BN254_FR_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export declare const silentLogger: pino.Logger<never, boolean>;
export declare function makeTransferLog(
  token: Address,
  from: Address,
  to: Address,
  amount: bigint,
): Log<bigint, number, false>;
export declare function createMockClient(
  overrides?: Partial<EVMClient>,
): EVMClient;
/** Default validate options — override only what the test cares about. */
export declare function validatorOpts(
  client: EVMClient,
  overrides?: Partial<ValidateTransactionOptions>,
): ValidateTransactionOptions;
export declare function createTestConfig(
  overrides?: Partial<AgentConfig>,
): AgentConfig;
export declare function createTestEnv(
  overrides?: Record<string, string>,
): Record<string, string>;
//# sourceMappingURL=helpers.d.ts.map
