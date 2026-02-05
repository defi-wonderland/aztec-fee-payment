/**
 * Unit tests for configuration validation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { agentConfigSchema, authwitRequestSchema } from "../config/schema.js";

describe("Configuration Schema", () => {
  describe("agentConfigSchema", () => {
    const validConfig = {
      port: 3000,
      host: "0.0.0.0",
      logLevel: "info",
      chains: {
        8453: {
          name: "Base",
          rpcUrl: "https://mainnet.base.org",
          feeCollectorAddress: "0x1234567890123456789012345678901234567890",
          aztTokenAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          requiredConfirmations: 12,
        },
      },
      spSigningKey:
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      rateLimit: {
        windowMs: 60000,
        maxRequests: 100,
      },
      aztec: {
        fpcAddress:
          "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        ownerAddress:
          "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
      },
    };

    it("validates correct configuration", () => {
      const result = agentConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("applies default values", () => {
      const minimalConfig = {
        chains: validConfig.chains,
        spSigningKey: validConfig.spSigningKey,
        aztec: validConfig.aztec,
      };

      const result = agentConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.port).toBe(3000);
        expect(result.data.host).toBe("0.0.0.0");
        expect(result.data.logLevel).toBe("info");
      }
    });

    it("rejects invalid SP signing key format", () => {
      const invalidConfig = {
        ...validConfig,
        spSigningKey: "invalid-key",
      };

      const result = agentConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it("rejects invalid Aztec address format", () => {
      const invalidConfig = {
        ...validConfig,
        aztec: {
          ...validConfig.aztec,
          fpcAddress: "0x123", // Too short
        },
      };

      const result = agentConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it("rejects invalid Ethereum address in chain config", () => {
      const invalidConfig = {
        ...validConfig,
        chains: {
          8453: {
            ...validConfig.chains[8453],
            feeCollectorAddress: "0x123", // Too short
          },
        },
      };

      const result = agentConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it("rejects invalid RPC URL", () => {
      const invalidConfig = {
        ...validConfig,
        chains: {
          8453: {
            ...validConfig.chains[8453],
            rpcUrl: "not-a-url",
          },
        },
      };

      const result = agentConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it("rejects invalid log level", () => {
      const invalidConfig = {
        ...validConfig,
        logLevel: "verbose", // Not a valid level
      };

      const result = agentConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe("authwitRequestSchema", () => {
    const validRequest = {
      evmTxHash:
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      evmChainId: 8453,
      signature: "0x" + "a".repeat(130), // 65 bytes = 130 hex chars
    };

    it("validates correct request", () => {
      const result = authwitRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("rejects invalid txHash format", () => {
      const invalidRequest = {
        ...validRequest,
        evmTxHash: "0x123", // Too short
      };

      const result = authwitRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects missing 0x prefix on txHash", () => {
      const invalidRequest = {
        ...validRequest,
        evmTxHash:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      };

      const result = authwitRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects invalid signature length", () => {
      const invalidRequest = {
        ...validRequest,
        signature: "0x" + "a".repeat(64), // Too short (should be 130)
      };

      const result = authwitRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects non-positive chain ID", () => {
      const invalidRequest = {
        ...validRequest,
        evmChainId: 0,
      };

      const result = authwitRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("rejects negative chain ID", () => {
      const invalidRequest = {
        ...validRequest,
        evmChainId: -1,
      };

      const result = authwitRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });
});
