import { describe, it, expect } from "vitest";
import type { Hex } from "viem";
import {
  AuthwitGenerator,
  formatAuthwitResponse,
} from "../services/crypto/authwit.js";
import { TEST_KEY, FPC_ADDRESS, OWNER_ADDRESS } from "./helpers.js";

const SECRET =
  "0x0000000000000000000000000000000000000000000000000000000000000abc" as Hex;
const LEGACY_OUT_OF_RANGE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const IN_RANGE_KEY =
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6" as Hex;

function makeGenerator(
  overrides?: Partial<{
    fpcAddress: string;
    chainId: bigint;
    version: bigint;
    ownerSigningKey: Hex;
  }>,
) {
  return new AuthwitGenerator({
    fpcAddress: overrides?.fpcAddress ?? FPC_ADDRESS,
    ownerAddress: OWNER_ADDRESS,
    ownerSigningKey: overrides?.ownerSigningKey ?? TEST_KEY,
    chainId: overrides?.chainId,
    version: overrides?.version,
  });
}

describe("AuthwitGenerator", () => {
  const generator = makeGenerator();

  it("generates a valid authwit", async () => {
    const authwit = await generator.generateMintAuthwit(
      1000000000000000000n,
      SECRET,
    );
    expect(authwit.amount).toBe(1000000000000000000n);
    expect(authwit.secret).toBe(SECRET);
    expect(authwit.innerHash).toBeDefined();
    expect(authwit.outerHash).toBeDefined();
    expect(authwit.witness.length).toBe(3);
  });

  it("is deterministic for hashes (same input = same hashes)", async () => {
    const a1 = await generator.generateMintAuthwit(500n, SECRET);
    const a2 = await generator.generateMintAuthwit(500n, SECRET);
    expect(a1.innerHash).toBe(a2.innerHash);
    expect(a1.outerHash).toBe(a2.outerHash);
  });

  it("produces different innerHash for different amounts", async () => {
    const a1 = await generator.generateMintAuthwit(100n, SECRET);
    const a2 = await generator.generateMintAuthwit(200n, SECRET);
    expect(a1.innerHash).not.toBe(a2.innerHash);
  });

  it("produces different innerHash for different secrets", async () => {
    const s2 =
      "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex;
    const a1 = await generator.generateMintAuthwit(100n, SECRET);
    const a2 = await generator.generateMintAuthwit(100n, s2);
    expect(a1.innerHash).not.toBe(a2.innerHash);
  });

  it("produces different outerHash for different chainIds", async () => {
    const gen1 = makeGenerator({ chainId: 0n });
    const gen2 = makeGenerator({ chainId: 1n });
    const a1 = await gen1.generateMintAuthwit(100n, SECRET);
    const a2 = await gen2.generateMintAuthwit(100n, SECRET);
    expect(a1.innerHash).toBe(a2.innerHash); // innerHash doesn't depend on chainId
    expect(a1.outerHash).not.toBe(a2.outerHash);
  });

  it("produces different outerHash for different versions", async () => {
    const gen1 = makeGenerator({ version: 1n });
    const gen2 = makeGenerator({ version: 2n });
    const a1 = await gen1.generateMintAuthwit(100n, SECRET);
    const a2 = await gen2.generateMintAuthwit(100n, SECRET);
    expect(a1.outerHash).not.toBe(a2.outerHash);
  });

  it("handles zero amount", async () => {
    const authwit = await generator.generateMintAuthwit(0n, SECRET);
    expect(authwit.innerHash).toBeDefined();
    expect(authwit.witness.length).toBe(3);
  });

  it("handles large amounts (2^128)", async () => {
    const authwit = await generator.generateMintAuthwit(2n ** 128n, SECRET);
    expect(authwit.amount).toBe(2n ** 128n);
    expect(authwit.innerHash).toBeDefined();
  });

  it("formatAuthwitResponse produces correct shape", async () => {
    const authwit = await generator.generateMintAuthwit(1000n, SECRET);
    const response = formatAuthwitResponse(authwit);
    expect(response.amount).toBe("1000");
    expect(response.secret).toBe(SECRET);
    expect(response.authwit.innerHash).toBe(authwit.innerHash);
    expect(response.authwit.outerHash).toBe(authwit.outerHash);
    expect(response.authwit.witness).toEqual(authwit.witness);
  });

  it("accepts legacy out-of-range authwit key by reducing it into Grumpkin field", async () => {
    const legacy = makeGenerator({ ownerSigningKey: LEGACY_OUT_OF_RANGE_KEY });
    const authwit = await legacy.generateMintAuthwit(123n, SECRET);
    expect(authwit.witness.length).toBe(3);
  });

  it("accepts already in-range authwit keys unchanged", async () => {
    const inRange = makeGenerator({ ownerSigningKey: IN_RANGE_KEY });
    const authwit = await inRange.generateMintAuthwit(123n, SECRET);
    expect(authwit.witness.length).toBe(3);
  });

  it("rejects authwit keys that are not 32-byte hex values", () => {
    expect(() => makeGenerator({ ownerSigningKey: "0x1234" as Hex })).toThrow(
      "ownerSigningKey must be a 32-byte hex value",
    );
  });
});
