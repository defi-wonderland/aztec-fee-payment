/**
 * Unit tests for deterministic secret generation
 */

import { describe, it, expect } from "vitest";
import type { Hex } from "viem";
import { SecretGenerator } from "../services/crypto/secret.js";

describe("SecretGenerator", () => {
  // Test signing key (DO NOT use in production)
  const testSigningKey =
    "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as Hex;
  // Test chain IDs
  const chainIdBase = 8453;
  const chainIdEthereum = 1;

  describe("constructor", () => {
    it("creates instance with valid 32-byte key", () => {
      const generator = new SecretGenerator(testSigningKey);
      expect(generator).toBeInstanceOf(SecretGenerator);
    });

    it("handles key without 0x prefix", () => {
      const keyWithoutPrefix = testSigningKey.slice(2) as Hex;
      const generator = new SecretGenerator(keyWithoutPrefix);
      expect(generator).toBeInstanceOf(SecretGenerator);
    });

    it("throws error for invalid key length", () => {
      const shortKey = "0x0123456789abcdef" as Hex;
      expect(() => new SecretGenerator(shortKey)).toThrow("32 bytes");
    });
  });

  describe("generateSecret", () => {
    it("generates a 32-byte hex secret", () => {
      const generator = new SecretGenerator(testSigningKey);
      const txHash =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;

      const secret = generator.generateSecret(txHash, chainIdBase);

      expect(secret).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("generates deterministic output (same input = same output)", () => {
      const generator = new SecretGenerator(testSigningKey);
      const txHash =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;

      const secret1 = generator.generateSecret(txHash, chainIdBase);
      const secret2 = generator.generateSecret(txHash, chainIdBase);

      expect(secret1).toBe(secret2);
    });

    it("generates different secrets for different transaction hashes", () => {
      const generator = new SecretGenerator(testSigningKey);
      const txHash1 =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;
      const txHash2 =
        "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" as Hex;

      const secret1 = generator.generateSecret(txHash1, chainIdBase);
      const secret2 = generator.generateSecret(txHash2, chainIdBase);

      expect(secret1).not.toBe(secret2);
    });

    it("generates different secrets for different signing keys", () => {
      const generator1 = new SecretGenerator(testSigningKey);
      const generator2 = new SecretGenerator(
        "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210" as Hex,
      );
      const txHash =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;

      const secret1 = generator1.generateSecret(txHash, chainIdBase);
      const secret2 = generator2.generateSecret(txHash, chainIdBase);

      expect(secret1).not.toBe(secret2);
    });

    it("handles txHash without 0x prefix", () => {
      const generator = new SecretGenerator(testSigningKey);
      const txHashWithPrefix =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;
      const txHashWithoutPrefix = txHashWithPrefix.slice(2) as Hex;

      const secret1 = generator.generateSecret(txHashWithPrefix, chainIdBase);
      const secret2 = generator.generateSecret(
        txHashWithoutPrefix,
        chainIdBase,
      );

      expect(secret1).toBe(secret2);
    });

    it("generates valid Aztec field element (less than BN254 Fr modulus)", () => {
      const generator = new SecretGenerator(testSigningKey);
      const txHash =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;

      const secret = generator.generateSecret(txHash, chainIdBase);
      const secretBigInt = BigInt(secret);

      // BN254 Fr modulus
      const frModulus = BigInt(
        "21888242871839275222246405745257275088548364400416034343698204186575808495617",
      );

      expect(secretBigInt).toBeLessThan(frModulus);
    });
  });

  describe("cross-chain replay prevention", () => {
    it("generates different secrets for same txHash on different chains", () => {
      const generator = new SecretGenerator(testSigningKey);
      const txHash =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;

      const secretBase = generator.generateSecret(txHash, chainIdBase);
      const secretEthereum = generator.generateSecret(txHash, chainIdEthereum);

      expect(secretBase).not.toBe(secretEthereum);
    });

    it("generates same secret for same txHash and chainId (idempotency)", () => {
      const generator = new SecretGenerator(testSigningKey);
      const txHash =
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;

      const secret1 = generator.generateSecret(txHash, chainIdBase);
      const secret2 = generator.generateSecret(txHash, chainIdBase);

      expect(secret1).toBe(secret2);
    });

    it("handles large chain IDs correctly", () => {
      const generator = new SecretGenerator(testSigningKey);
      const txHash =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;

      // Test with a large chain ID (e.g., zkSync Era = 324, Arbitrum = 42161, etc.)
      const largeChainId = 999999999;
      const secret = generator.generateSecret(txHash, largeChainId);

      expect(secret).toMatch(/^0x[0-9a-f]{64}$/);

      // Verify it's different from common chain IDs
      const secretBase = generator.generateSecret(txHash, chainIdBase);
      expect(secret).not.toBe(secretBase);
    });

    it("treats different chain IDs as distinct even with same txHash bytes", () => {
      const generator = new SecretGenerator(testSigningKey);
      const txHash =
        "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;

      // Chain ID 1 should produce different secret than chain ID 256
      // (both could theoretically conflict if chainId encoding was wrong)
      const secret1 = generator.generateSecret(txHash, 1);
      const secret256 = generator.generateSecret(txHash, 256);

      expect(secret1).not.toBe(secret256);
    });
  });
});
