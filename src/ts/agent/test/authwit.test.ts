import { describe, it, expect } from "vitest";
import type { Hex } from "viem";
import {
  AuthwitGenerator,
  formatAuthwitResponse,
} from "../services/crypto/authwit.js";
import { TEST_KEY, FPC_ADDRESS, OWNER_ADDRESS } from "./helpers.js";

const HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000abc" as Hex;

function makeGenerator(
  overrides?: Partial<{ fpcAddress: string; chainId: bigint; version: bigint }>,
) {
  return new AuthwitGenerator({
    fpcAddress: overrides?.fpcAddress ?? FPC_ADDRESS,
    ownerAddress: OWNER_ADDRESS,
    ownerSigningKey: TEST_KEY,
    chainId: overrides?.chainId,
    version: overrides?.version,
  });
}

describe("AuthwitGenerator", () => {
  const generator = makeGenerator();

  it("generates a valid authwit", async () => {
    const authwit = await generator.generateMintAuthwit(
      1000000000000000000n,
      HASH,
    );
    expect(authwit.amount).toBe(1000000000000000000n);
    expect(authwit.hash).toBe(HASH);
    expect(authwit.innerHash).toBeDefined();
    expect(authwit.outerHash).toBeDefined();
    expect(authwit.witness.length).toBe(3);
  });

  it("is deterministic for hashes (same input = same hashes)", async () => {
    const a1 = await generator.generateMintAuthwit(500n, HASH);
    const a2 = await generator.generateMintAuthwit(500n, HASH);
    expect(a1.innerHash).toBe(a2.innerHash);
    expect(a1.outerHash).toBe(a2.outerHash);
  });

  it("produces different innerHash for different amounts", async () => {
    const a1 = await generator.generateMintAuthwit(100n, HASH);
    const a2 = await generator.generateMintAuthwit(200n, HASH);
    expect(a1.innerHash).not.toBe(a2.innerHash);
  });

  it("produces different innerHash for different hashes", async () => {
    const s2 =
      "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex;
    const a1 = await generator.generateMintAuthwit(100n, HASH);
    const a2 = await generator.generateMintAuthwit(100n, s2);
    expect(a1.innerHash).not.toBe(a2.innerHash);
  });

  it("produces different innerHash for different fpcAddresses", async () => {
    const gen2 = makeGenerator({
      fpcAddress:
        "0x0000000000000000000000000000000000000000000000000000000000000099",
    });
    const a1 = await generator.generateMintAuthwit(100n, HASH);
    const a2 = await gen2.generateMintAuthwit(100n, HASH);
    expect(a1.innerHash).not.toBe(a2.innerHash);
  });

  it("produces different outerHash for different chainIds", async () => {
    const gen1 = makeGenerator({ chainId: 0n });
    const gen2 = makeGenerator({ chainId: 1n });
    const a1 = await gen1.generateMintAuthwit(100n, HASH);
    const a2 = await gen2.generateMintAuthwit(100n, HASH);
    expect(a1.innerHash).toBe(a2.innerHash); // innerHash doesn't depend on chainId
    expect(a1.outerHash).not.toBe(a2.outerHash);
  });

  it("produces different outerHash for different versions", async () => {
    const gen1 = makeGenerator({ version: 1n });
    const gen2 = makeGenerator({ version: 2n });
    const a1 = await gen1.generateMintAuthwit(100n, HASH);
    const a2 = await gen2.generateMintAuthwit(100n, HASH);
    expect(a1.outerHash).not.toBe(a2.outerHash);
  });

  it("handles zero amount", async () => {
    const authwit = await generator.generateMintAuthwit(0n, HASH);
    expect(authwit.innerHash).toBeDefined();
    expect(authwit.witness.length).toBe(3);
  });

  it("handles large amounts (2^128)", async () => {
    const authwit = await generator.generateMintAuthwit(2n ** 128n, HASH);
    expect(authwit.amount).toBe(2n ** 128n);
    expect(authwit.innerHash).toBeDefined();
  });

  it("formatAuthwitResponse produces correct shape", async () => {
    const authwit = await generator.generateMintAuthwit(1000n, HASH);
    const response = formatAuthwitResponse(authwit);
    expect(response.amount).toBe("1000");
    expect(response.hash).toBe(HASH);
    expect(response.authwit.innerHash).toBe(authwit.innerHash);
    expect(response.authwit.outerHash).toBe(authwit.outerHash);
    expect(response.authwit.witness).toEqual(authwit.witness);
  });
});
