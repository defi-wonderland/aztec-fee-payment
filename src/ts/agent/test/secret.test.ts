import { describe, it, expect } from "vitest";
import type { Address, Hex } from "viem";
import { SecretGenerator } from "../services/crypto/secret.js";
import {
  TEST_KEY,
  OTHER_KEY,
  TX_HASH,
  USER,
  BN254_FR_MODULUS,
} from "./helpers.js";

describe("SecretGenerator", () => {
  const generator = new SecretGenerator(TEST_KEY);

  it("generates a deterministic secret", () => {
    expect(generator.generateSecret(TX_HASH, USER)).toBe(
      generator.generateSecret(TX_HASH, USER),
    );
  });

  it("returns a 0x-prefixed 32-byte hex string", () => {
    expect(generator.generateSecret(TX_HASH, USER)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("produces a valid BN254 Fr field element", () => {
    const value = BigInt(generator.generateSecret(TX_HASH, USER));
    expect(value).toBeGreaterThan(0n);
    expect(value).toBeLessThan(BN254_FR_MODULUS);
  });

  it("produces different secrets for different txHashes", () => {
    const other =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
    expect(generator.generateSecret(TX_HASH, USER)).not.toBe(
      generator.generateSecret(other, USER),
    );
  });

  it("produces different secrets for different senders", () => {
    const otherSender = "0x4444444444444444444444444444444444444444" as Address;
    expect(generator.generateSecret(TX_HASH, USER)).not.toBe(
      generator.generateSecret(TX_HASH, otherSender),
    );
  });

  it("produces different secrets for different signing keys", () => {
    const other = new SecretGenerator(OTHER_KEY);
    expect(generator.generateSecret(TX_HASH, USER)).not.toBe(
      other.generateSecret(TX_HASH, USER),
    );
  });
});
