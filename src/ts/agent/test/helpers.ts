import { vi } from "vitest";
import type { Address, Hex, TransactionReceipt, Log } from "viem";
import { encodeEventTopics, encodeAbiParameters } from "viem";
import type { AgentConfig } from "../types/index.js";
import type { EVMClient } from "../services/evm/client.js";
import type { ValidateTransactionOptions } from "../services/evm/validator.js";
import pino from "pino";

// ── Shared constants ────────────────────────────────────────────────────────

export const TEST_KEY =
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6" as Hex;
export const OTHER_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
export const TOPUP_CONTRACT =
  "0x1111111111111111111111111111111111111111" as Address;
export const USER = "0x3333333333333333333333333333333333333333" as Address;
export const TX_HASH =
  "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as Hex;
export const FPC_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000001";
export const OWNER_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000002";
export const CHAIN_ID = 84532;
export const BN254_FR_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const silentLogger = pino({ level: "silent" });

// ── TopUp event log helpers ─────────────────────────────────────────────────

const TOPUP_EVENT_ABI = [
  {
    type: "event" as const,
    name: "TopUp" as const,
    inputs: [
      { name: "from", type: "address" as const, indexed: true },
      { name: "amount", type: "uint256" as const, indexed: false },
    ],
  },
];

export function makeTopUpLog(
  contract: Address,
  from: Address,
  amount: bigint,
): Log<bigint, number, false> {
  const topics = encodeEventTopics({
    abi: TOPUP_EVENT_ABI,
    eventName: "TopUp",
    args: { from },
  });
  const data = encodeAbiParameters([{ type: "uint256" }], [amount]);
  return {
    address: contract,
    topics: topics as [`0x${string}`, ...`0x${string}`[]],
    data,
    blockNumber: 100n,
    transactionHash: TX_HASH,
    transactionIndex: 0,
    blockHash:
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
    logIndex: 0,
    removed: false,
  };
}

// ── Mock EVM client ─────────────────────────────────────────────────────────

export function createMockClient(
  overrides: Partial<EVMClient> = {},
): EVMClient {
  return {
    chainId: CHAIN_ID,
    getTransactionReceipt: vi.fn().mockResolvedValue({
      status: "success",
      blockNumber: 100n,
      from: USER,
      logs: [makeTopUpLog(TOPUP_CONTRACT, USER, 1000000000000000000n)],
    } as unknown as TransactionReceipt),
    getBlockNumber: vi.fn().mockResolvedValue(120n),
    ...overrides,
  };
}

/** Default validate options — override only what the test cares about. */
export function validatorOpts(
  client: EVMClient,
  overrides?: Partial<ValidateTransactionOptions>,
): ValidateTransactionOptions {
  return {
    client,
    txHash: TX_HASH,
    from: USER,
    topUpContractAddress: TOPUP_CONTRACT,
    requiredConfirmations: 6,
    minAmount: 1n,
    logger: silentLogger,
    ...overrides,
  };
}

// ── Config fixtures ─────────────────────────────────────────────────────────

export function createTestConfig(
  overrides?: Partial<AgentConfig>,
): AgentConfig {
  return {
    port: 3000,
    host: "0.0.0.0",
    logLevel: "info",
    chains: {
      [CHAIN_ID]: {
        name: "base-sepolia",
        rpcUrl: "https://sepolia.base.org",
        topUpContractAddress: TOPUP_CONTRACT,
        requiredConfirmations: 6,
      },
    },
    spSigningKey: TEST_KEY,
    minAmount: 1n,
    rateLimit: { windowMs: 60_000, maxRequests: 100 },
    aztec: { fpcAddress: FPC_ADDRESS, ownerAddress: OWNER_ADDRESS },
    ...overrides,
  };
}

export function createTestEnv(
  overrides?: Record<string, string>,
): Record<string, string> {
  return {
    SP_SIGNING_KEY: TEST_KEY,
    FPC_ADDRESS,
    OWNER_ADDRESS,
    PORT: "3000",
    HOST: "0.0.0.0",
    LOG_LEVEL: "info",
    CHAIN_84532_NAME: "base-sepolia",
    CHAIN_84532_RPC_URL: "https://sepolia.base.org",
    CHAIN_84532_TOPUP_CONTRACT: TOPUP_CONTRACT,
    CHAIN_84532_CONFIRMATIONS: "6",
    ...overrides,
  };
}
