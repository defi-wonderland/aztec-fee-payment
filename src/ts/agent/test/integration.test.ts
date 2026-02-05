/**
 * Integration tests for the authwit request flow
 *
 * These tests verify the complete flow from request to response,
 * using mocked EVM RPC responses.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Hex, Address } from "viem";
import { privateKeyToAccount, signTypedData } from "viem/accounts";
import Fastify, { type FastifyInstance } from "fastify";
import { getTypedDataForSigning } from "../services/crypto/eip712.js";
import { SecretGenerator } from "../services/crypto/secret.js";
import { createLogger } from "../middleware/logger.js";
import {
  AppError,
  createErrorHandler,
  createNotFoundHandler,
} from "../middleware/errorHandler.js";
import { registerAuthwitRoutes } from "../routes/authwit.js";
import { MultiChainEVMClient, type EVMClient } from "../services/evm/client.js";
import { AuthwitGenerator } from "../services/crypto/authwit.js";
import type { AgentConfig } from "../types/index.js";

// Test constants
const TEST_PRIVATE_KEY =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as Hex;
const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVATE_KEY);
const SP_SIGNING_KEY =
  "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210" as Hex;
const FEE_COLLECTOR = "0x1234567890123456789012345678901234567890" as Address;
const AZT_TOKEN = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
const FPC_ADDRESS =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OWNER_ADDRESS =
  "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const CHAIN_ID = 8453;

// Mock transaction data
const MOCK_TX_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
const MOCK_AMOUNT = 1000000000000000000n; // 1 token
const MOCK_BLOCK_NUMBER = 100n;
const CURRENT_BLOCK_NUMBER = 120n; // 20 confirmations

describe("Authwit Request Integration", () => {
  let app: FastifyInstance;
  let mockEvmClient: EVMClient;

  beforeAll(async () => {
    // Create mock EVM client
    mockEvmClient = createMockEVMClient();

    // Create test configuration
    const config: AgentConfig = {
      port: 3000,
      host: "0.0.0.0",
      logLevel: "error", // Quiet logs during tests
      chains: {
        [CHAIN_ID]: {
          name: "Base",
          rpcUrl: "https://mainnet.base.org",
          feeCollectorAddress: FEE_COLLECTOR,
          aztTokenAddress: AZT_TOKEN,
          requiredConfirmations: 12,
        },
      },
      spSigningKey: SP_SIGNING_KEY,
      rateLimit: { windowMs: 60000, maxRequests: 100 },
      aztec: { fpcAddress: FPC_ADDRESS, ownerAddress: OWNER_ADDRESS },
    };

    const logger = createLogger({ logLevel: "error" });

    // Create mock MultiChainEVMClient
    const mockMultiChainClient = {
      getClientForChain: (chainId: number) =>
        chainId === CHAIN_ID ? mockEvmClient : undefined,
      isChainSupported: (chainId: number) => chainId === CHAIN_ID,
      getSupportedChains: () => [CHAIN_ID],
    } as unknown as MultiChainEVMClient;

    const secretGenerator = new SecretGenerator(SP_SIGNING_KEY);
    const authwitGenerator = new AuthwitGenerator({
      fpcAddress: FPC_ADDRESS,
      ownerAddress: OWNER_ADDRESS,
      ownerSigningKey: SP_SIGNING_KEY,
    });

    // Create Fastify instance
    app = Fastify({ logger: false });
    app.setErrorHandler(createErrorHandler(logger));
    app.setNotFoundHandler(createNotFoundHandler());

    // Register routes
    await app.register(
      async (apiApp) => {
        await registerAuthwitRoutes(apiApp, {
          config,
          logger,
          evmClients: mockMultiChainClient,
          secretGenerator,
          authwitGenerator,
        });
      },
      { prefix: "/api/v1" },
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/v1/authwit/request", () => {
    it("returns valid authwit for legitimate payment", async () => {
      // Sign the claim request
      const typedData = getTypedDataForSigning(MOCK_TX_HASH, CHAIN_ID);
      const signature = await signTypedData({
        ...typedData,
        privateKey: TEST_PRIVATE_KEY,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/authwit/request",
        payload: {
          evmTxHash: MOCK_TX_HASH,
          evmChainId: CHAIN_ID,
          signature,
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.amount).toBe(MOCK_AMOUNT.toString());
      expect(body.secret).toMatch(/^0x[0-9a-f]{64}$/);
      expect(body.authwit).toBeDefined();
      expect(body.authwit.innerHash).toMatch(/^0x[0-9a-f]+$/);
      expect(body.authwit.outerHash).toMatch(/^0x[0-9a-f]+$/);
      expect(Array.isArray(body.authwit.witness)).toBe(true);
    });

    it("returns same response for same txHash (idempotent)", async () => {
      const typedData = getTypedDataForSigning(MOCK_TX_HASH, CHAIN_ID);
      const signature = await signTypedData({
        ...typedData,
        privateKey: TEST_PRIVATE_KEY,
      });

      const payload = {
        evmTxHash: MOCK_TX_HASH,
        evmChainId: CHAIN_ID,
        signature,
      };

      const response1 = await app.inject({
        method: "POST",
        url: "/api/v1/authwit/request",
        payload,
      });

      const response2 = await app.inject({
        method: "POST",
        url: "/api/v1/authwit/request",
        payload,
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);

      const body1 = response1.json();
      const body2 = response2.json();

      // Same txHash should produce same secret and authwit
      expect(body1.secret).toBe(body2.secret);
      expect(body1.authwit.innerHash).toBe(body2.authwit.innerHash);
      expect(body1.authwit.outerHash).toBe(body2.authwit.outerHash);
    });

    it("rejects invalid signature", async () => {
      // Sign with a different private key
      const otherPrivateKey =
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
      const typedData = getTypedDataForSigning(MOCK_TX_HASH, CHAIN_ID);
      const signature = await signTypedData({
        ...typedData,
        privateKey: otherPrivateKey,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/authwit/request",
        payload: {
          evmTxHash: MOCK_TX_HASH,
          evmChainId: CHAIN_ID,
          signature,
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.error).toBe("INVALID_SIGNATURE");
    });

    it("rejects unsupported chain", async () => {
      const unsupportedChainId = 999999;
      const typedData = getTypedDataForSigning(
        MOCK_TX_HASH,
        unsupportedChainId,
      );
      const signature = await signTypedData({
        ...typedData,
        privateKey: TEST_PRIVATE_KEY,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/authwit/request",
        payload: {
          evmTxHash: MOCK_TX_HASH,
          evmChainId: unsupportedChainId,
          signature,
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.error).toBe("INVALID_CHAIN");
    });

    it("rejects invalid txHash format", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/authwit/request",
        payload: {
          evmTxHash: "0x123", // Too short
          evmChainId: CHAIN_ID,
          signature: "0x" + "a".repeat(130),
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.error).toBe("INVALID_REQUEST");
    });

    it("rejects invalid signature format", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/authwit/request",
        payload: {
          evmTxHash: MOCK_TX_HASH,
          evmChainId: CHAIN_ID,
          signature: "0x" + "a".repeat(64), // Too short
        },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json();
      expect(body.error).toBe("INVALID_REQUEST");
    });

    it("returns 404 for unknown routes", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/unknown",
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

// Helper to create mock EVM client
function createMockEVMClient(): EVMClient {
  return {
    chainId: CHAIN_ID,

    async getTransaction(txHash: Hex) {
      if (txHash === MOCK_TX_HASH) {
        return {
          hash: txHash,
          from: TEST_ACCOUNT.address,
          to: FEE_COLLECTOR,
          value: 0n, // ERC20 transfer, not native
          blockNumber: MOCK_BLOCK_NUMBER,
          nonce: 1,
          gas: 21000n,
          gasPrice: 1000000000n,
          input: "0x",
          type: "eip1559" as const,
          v: 0n,
          r: "0x" as Hex,
          s: "0x" as Hex,
          blockHash: "0x" as Hex,
          transactionIndex: 0,
          maxFeePerGas: 1000000000n,
          maxPriorityFeePerGas: 1000000000n,
          chainId: CHAIN_ID,
          typeHex: "0x2",
          accessList: [],
          yParity: 0,
        } as any;
      }
      return null;
    },

    async getTransactionReceipt(txHash: Hex) {
      if (txHash === MOCK_TX_HASH) {
        // Create Transfer event log
        const fromTopic = `0x000000000000000000000000${TEST_ACCOUNT.address.slice(2)}`;
        const toTopic = `0x000000000000000000000000${FEE_COLLECTOR.slice(2)}`;
        const amountHex = MOCK_AMOUNT.toString(16).padStart(64, "0");

        return {
          blockHash: "0x" as Hex,
          blockNumber: MOCK_BLOCK_NUMBER,
          contractAddress: null,
          cumulativeGasUsed: 21000n,
          effectiveGasPrice: 1000000000n,
          from: TEST_ACCOUNT.address,
          gasUsed: 21000n,
          logs: [
            {
              address: AZT_TOKEN,
              topics: [
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer
                fromTopic as Hex,
                toTopic as Hex,
              ],
              data: `0x${amountHex}` as Hex,
              blockNumber: MOCK_BLOCK_NUMBER,
              blockHash: "0x" as Hex,
              transactionHash: txHash,
              transactionIndex: 0,
              logIndex: 0,
              removed: false,
            },
          ],
          logsBloom: "0x" as Hex,
          status: "success" as const,
          to: FEE_COLLECTOR,
          transactionHash: txHash,
          transactionIndex: 0,
          type: "eip1559" as const,
        } as any;
      }
      return null;
    },

    async getBlockNumber() {
      return CURRENT_BLOCK_NUMBER;
    },
  };
}
