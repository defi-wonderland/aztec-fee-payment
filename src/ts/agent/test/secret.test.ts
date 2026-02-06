import { describe, it, expect } from "vitest";
import type { Hex } from "viem";
import { SecretGenerator } from "../services/crypto/secret.js";
import { TEST_KEY, OTHER_KEY, TX_HASH, BN254_FR_MODULUS } from "./helpers.js";

describe("SecretGenerator", () => {
  const generator = new SecretGenerator(TEST_KEY);

  it("generates a deterministic secret", () => {
    expect(generator.generateSecret(TX_HASH, 84532)).toBe(
      generator.generateSecret(TX_HASH, 84532),
    );
  });

  it("returns a 0x-prefixed 32-byte hex string", () => {
    expect(generator.generateSecret(TX_HASH, 84532)).toMatch(
      /^0x[0-9a-f]{64}$/,
    );
  });

  it("produces a valid BN254 Fr field element", () => {
    const value = BigInt(generator.generateSecret(TX_HASH, 84532));
    expect(value).toBeGreaterThan(0n);
    expect(value).toBeLessThan(BN254_FR_MODULUS);
  });

  it("produces different secrets for different chainIds", () => {
    expect(generator.generateSecret(TX_HASH, 84532)).not.toBe(
      generator.generateSecret(TX_HASH, 8453),
    );
  });

  it("produces different secrets for different txHashes", () => {
    const other =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
    expect(generator.generateSecret(TX_HASH, 84532)).not.toBe(
      generator.generateSecret(other, 84532),
    );
  });

  it("produces different secrets for different signing keys", () => {
    const other = new SecretGenerator(OTHER_KEY);
    expect(generator.generateSecret(TX_HASH, 84532)).not.toBe(
      other.generateSecret(TX_HASH, 84532),
    );
  });

  it("distinguishes chainId 1 from chainId 256 (encoding correctness)", () => {
    expect(generator.generateSecret(TX_HASH, 1)).not.toBe(
      generator.generateSecret(TX_HASH, 256),
    );
  });

  it("handles large chain IDs", () => {
    const secret = generator.generateSecret(TX_HASH, 999999999);
    expect(secret).toMatch(/^0x[0-9a-f]{64}$/);
    expect(BigInt(secret)).toBeLessThan(BN254_FR_MODULUS);
  });
});
