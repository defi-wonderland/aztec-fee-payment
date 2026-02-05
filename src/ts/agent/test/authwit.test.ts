/**
 * Unit tests for Aztec authwit generation
 */

import { describe, it, expect } from "vitest";
import type { Hex } from "viem";
import {
  AuthwitGenerator,
  formatAuthwitResponse,
} from "../services/crypto/authwit.js";
import type { MintAuthwit } from "../types/index.js";

// ============================================================================
// Test Constants
// ============================================================================

// Valid Aztec addresses (32-byte hex strings)
const TEST_FPC_ADDRESS =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const TEST_OWNER_ADDRESS =
  "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";

// Valid Grumpkin signing key (32 bytes)
const TEST_SIGNING_KEY =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as Hex;
const TEST_SIGNING_KEY_ALT =
  "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210" as Hex;

// Test secret (valid BN254 Fr field element)
const TEST_SECRET =
  "0x00000000000000000000000000000000000000000000000000000000deadbeef" as Hex;
const TEST_SECRET_ALT =
  "0x000000000000000000000000000000000000000000000000000000000badcafe" as Hex;

// ============================================================================
// Tests
// ============================================================================

describe("AuthwitGenerator", () => {
  describe("constructor", () => {
    it("creates instance with valid config", () => {
      const generator = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
      });

      expect(generator).toBeInstanceOf(AuthwitGenerator);
    });

    it("accepts custom chainId and version", () => {
      const generator = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
        chainId: 42n,
        version: 2n,
      });

      expect(generator).toBeInstanceOf(AuthwitGenerator);
    });

    it("uses default chainId=0 and version=1 when not specified", async () => {
      const generatorDefault = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
      });

      const generatorExplicit = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
        chainId: 0n,
        version: 1n,
      });

      // Both should produce identical hashes (witness uses random Schnorr nonces)
      const authwit1 = await generatorDefault.generateMintAuthwit(
        100n,
        TEST_SECRET,
      );
      const authwit2 = await generatorExplicit.generateMintAuthwit(
        100n,
        TEST_SECRET,
      );

      expect(authwit1.innerHash).toBe(authwit2.innerHash);
      expect(authwit1.outerHash).toBe(authwit2.outerHash);
    });

    it("handles signing key without 0x prefix", async () => {
      const keyWithPrefix = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
      });

      const keyWithoutPrefix = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY.slice(2) as Hex,
      });

      const authwit1 = await keyWithPrefix.generateMintAuthwit(
        100n,
        TEST_SECRET,
      );
      const authwit2 = await keyWithoutPrefix.generateMintAuthwit(
        100n,
        TEST_SECRET,
      );

      expect(authwit1.outerHash).toBe(authwit2.outerHash);
    });
  });

  describe("generateMintAuthwit", () => {
    let generator: AuthwitGenerator;

    function createGenerator() {
      return new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
      });
    }

    it("returns correct MintAuthwit structure", async () => {
      generator = createGenerator();
      const authwit = await generator.generateMintAuthwit(1000n, TEST_SECRET);

      expect(authwit).toHaveProperty("amount");
      expect(authwit).toHaveProperty("secret");
      expect(authwit).toHaveProperty("innerHash");
      expect(authwit).toHaveProperty("outerHash");
      expect(authwit).toHaveProperty("witness");
    });

    it("preserves amount and secret in output", async () => {
      generator = createGenerator();
      const amount = 42000n;
      const authwit = await generator.generateMintAuthwit(amount, TEST_SECRET);

      expect(authwit.amount).toBe(amount);
      expect(authwit.secret).toBe(TEST_SECRET);
    });

    it("returns non-empty hashes and witness", async () => {
      generator = createGenerator();
      const authwit = await generator.generateMintAuthwit(1000n, TEST_SECRET);

      expect(authwit.innerHash).toBeTruthy();
      expect(authwit.outerHash).toBeTruthy();
      expect(authwit.witness.length).toBeGreaterThan(0);
    });

    it("innerHash and outerHash are hex-like strings", async () => {
      generator = createGenerator();
      const authwit = await generator.generateMintAuthwit(1000n, TEST_SECRET);

      // Aztec Fr fields are represented as hex strings (with or without 0x)
      expect(typeof authwit.innerHash).toBe("string");
      expect(typeof authwit.outerHash).toBe("string");
    });

    it("witness array contains string elements", async () => {
      generator = createGenerator();
      const authwit = await generator.generateMintAuthwit(1000n, TEST_SECRET);

      for (const w of authwit.witness) {
        expect(typeof w).toBe("string");
      }
    });

    it("is deterministic for hashes (same inputs produce same hashes)", async () => {
      generator = createGenerator();
      const authwit1 = await generator.generateMintAuthwit(1000n, TEST_SECRET);
      const authwit2 = await generator.generateMintAuthwit(1000n, TEST_SECRET);

      expect(authwit1.innerHash).toBe(authwit2.innerHash);
      expect(authwit1.outerHash).toBe(authwit2.outerHash);
      // Note: witness (Schnorr signature) uses random nonces, so it may differ
    });

    it("produces different innerHash for different amounts", async () => {
      generator = createGenerator();
      const authwit1 = await generator.generateMintAuthwit(100n, TEST_SECRET);
      const authwit2 = await generator.generateMintAuthwit(200n, TEST_SECRET);

      expect(authwit1.innerHash).not.toBe(authwit2.innerHash);
    });

    it("produces different innerHash for different secrets", async () => {
      generator = createGenerator();
      const authwit1 = await generator.generateMintAuthwit(100n, TEST_SECRET);
      const authwit2 = await generator.generateMintAuthwit(
        100n,
        TEST_SECRET_ALT,
      );

      expect(authwit1.innerHash).not.toBe(authwit2.innerHash);
    });

    it("produces different outerHash for different amounts", async () => {
      generator = createGenerator();
      const authwit1 = await generator.generateMintAuthwit(100n, TEST_SECRET);
      const authwit2 = await generator.generateMintAuthwit(200n, TEST_SECRET);

      expect(authwit1.outerHash).not.toBe(authwit2.outerHash);
    });

    it("produces different witness for different signing keys", async () => {
      const gen1 = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
      });
      const gen2 = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY_ALT,
      });

      const authwit1 = await gen1.generateMintAuthwit(100n, TEST_SECRET);
      const authwit2 = await gen2.generateMintAuthwit(100n, TEST_SECRET);

      // Same inner/outer hashes (same FPC address and args), but different signatures
      expect(authwit1.innerHash).toBe(authwit2.innerHash);
      expect(authwit1.outerHash).toBe(authwit2.outerHash);
      expect(authwit1.witness).not.toEqual(authwit2.witness);
    });

    it("produces different outerHash for different chainIds", async () => {
      const gen1 = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
        chainId: 1n,
      });
      const gen2 = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
        chainId: 2n,
      });

      const authwit1 = await gen1.generateMintAuthwit(100n, TEST_SECRET);
      const authwit2 = await gen2.generateMintAuthwit(100n, TEST_SECRET);

      // Same inner hash (chainId not part of inner), different outer hash
      expect(authwit1.innerHash).toBe(authwit2.innerHash);
      expect(authwit1.outerHash).not.toBe(authwit2.outerHash);
    });

    it("produces different innerHash for different fpcAddress", async () => {
      const altFpcAddress =
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const gen1 = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
      });
      const gen2 = new AuthwitGenerator({
        fpcAddress: altFpcAddress,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
      });

      const authwit1 = await gen1.generateMintAuthwit(100n, TEST_SECRET);
      const authwit2 = await gen2.generateMintAuthwit(100n, TEST_SECRET);

      expect(authwit1.innerHash).not.toBe(authwit2.innerHash);
    });

    it("produces different outerHash for different versions", async () => {
      const gen1 = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
        version: 1n,
      });
      const gen2 = new AuthwitGenerator({
        fpcAddress: TEST_FPC_ADDRESS,
        ownerAddress: TEST_OWNER_ADDRESS,
        ownerSigningKey: TEST_SIGNING_KEY,
        version: 2n,
      });

      const authwit1 = await gen1.generateMintAuthwit(100n, TEST_SECRET);
      const authwit2 = await gen2.generateMintAuthwit(100n, TEST_SECRET);

      // Same inner hash (version not part of inner), different outer hash
      expect(authwit1.innerHash).toBe(authwit2.innerHash);
      expect(authwit1.outerHash).not.toBe(authwit2.outerHash);
    });

    it("handles zero amount", async () => {
      generator = createGenerator();
      const authwit = await generator.generateMintAuthwit(0n, TEST_SECRET);

      expect(authwit.amount).toBe(0n);
      expect(authwit.innerHash).toBeTruthy();
    });

    it("handles large amounts", async () => {
      generator = createGenerator();
      const largeAmount = 2n ** 200n;
      const authwit = await generator.generateMintAuthwit(
        largeAmount,
        TEST_SECRET,
      );

      expect(authwit.amount).toBe(largeAmount);
    });
  });
});

describe("formatAuthwitResponse", () => {
  it("formats amount as string", () => {
    const authwit: MintAuthwit = {
      amount: 1000000n,
      secret: "0xdeadbeef",
      innerHash: "0xinner",
      outerHash: "0xouter",
      witness: ["0xw1", "0xw2"],
    };

    const response = formatAuthwitResponse(authwit);

    expect(response.amount).toBe("1000000");
    expect(typeof response.amount).toBe("string");
  });

  it("preserves secret as-is", () => {
    const authwit: MintAuthwit = {
      amount: 100n,
      secret: "0xdeadbeefcafe",
      innerHash: "0xinner",
      outerHash: "0xouter",
      witness: ["0xw1"],
    };

    const response = formatAuthwitResponse(authwit);

    expect(response.secret).toBe("0xdeadbeefcafe");
  });

  it("nests authwit fields under authwit key", () => {
    const authwit: MintAuthwit = {
      amount: 100n,
      secret: "0xsecret",
      innerHash: "0xinner",
      outerHash: "0xouter",
      witness: ["0xw1", "0xw2", "0xw3"],
    };

    const response = formatAuthwitResponse(authwit);

    expect(response.authwit).toBeDefined();
    expect(response.authwit.innerHash).toBe("0xinner");
    expect(response.authwit.outerHash).toBe("0xouter");
    expect(response.authwit.witness).toEqual(["0xw1", "0xw2", "0xw3"]);
  });

  it("formats zero amount correctly", () => {
    const authwit: MintAuthwit = {
      amount: 0n,
      secret: "0x00",
      innerHash: "0x00",
      outerHash: "0x00",
      witness: [],
    };

    const response = formatAuthwitResponse(authwit);

    expect(response.amount).toBe("0");
  });

  it("formats very large amount correctly", () => {
    const largeAmount = 2n ** 128n - 1n;
    const authwit: MintAuthwit = {
      amount: largeAmount,
      secret: "0xsecret",
      innerHash: "0xinner",
      outerHash: "0xouter",
      witness: ["0xw1"],
    };

    const response = formatAuthwitResponse(authwit);

    expect(response.amount).toBe(largeAmount.toString());
  });
});
