import { describe, it, expect } from "vitest";
import type { Hex } from "viem";
import { SecretGenerator } from "../services/crypto/secret.js";
import { TEST_KEY, OTHER_KEY, TX_HASH, BN254_FR_MODULUS } from "./helpers.js";

describe("SecretGenerator", () => {
  const generator = new SecretGenerator(TEST_KEY);

  it("generates a deterministic secret", () => {
    expect(generator.generateSecret(TX_HASH)).toBe(
      generator.generateSecret(TX_HASH),
    );
  });

  it("returns a 0x-prefixed 32-byte hex string", () => {
    expect(generator.generateSecret(TX_HASH)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("produces a valid BN254 Fr field element", () => {
    const value = BigInt(generator.generateSecret(TX_HASH));
    expect(value).toBeGreaterThan(0n);
    expect(value).toBeLessThan(BN254_FR_MODULUS);
  });

  it("produces different secrets for different txHashes", () => {
    const other =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
    expect(generator.generateSecret(TX_HASH)).not.toBe(
      generator.generateSecret(other),
    );
  });

  it("produces different secrets for different signing keys", () => {
    const other = new SecretGenerator(OTHER_KEY);
    expect(generator.generateSecret(TX_HASH)).not.toBe(
      other.generateSecret(TX_HASH),
    );
  });
});
