import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Server } from "http";

import { getTypedDataForSigning } from "../services/crypto/eip712.js";
import {
  createTestConfig,
  TEST_KEY,
  OTHER_KEY,
  FEE_COLLECTOR,
  AZT_TOKEN,
  TX_HASH,
  CHAIN_ID,
} from "./helpers.js";

const userAccount = privateKeyToAccount(OTHER_KEY);

// Mock the EVM validator at service level (not viem itself)
vi.mock("../services/evm/validator.js", () => ({
  validateTransaction: vi.fn().mockResolvedValue({
    valid: true,
    amount: 1000000000000000000n,
    from: userAccount.address,
  }),
}));

// Mock the EVM client so the server doesn't try to connect to real RPCs
vi.mock("../services/evm/client.js", () => ({
  MultiChainEVMClient: class {
    getClientForChain() {
      return { chainId: CHAIN_ID };
    }
    isChainSupported() {
      return true;
    }
    getSupportedChains() {
      return [CHAIN_ID];
    }
  },
}));

async function signClaimRequest(txHash: Hex, chainId: number): Promise<Hex> {
  return userAccount.signTypedData(getTypedDataForSigning(txHash, chainId));
}

describe("Integration: Authwit Request Flow", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const config = createTestConfig({
      port: 0,
      logLevel: "error",
      chains: {
        [CHAIN_ID]: {
          name: "base-sepolia",
          rpcUrl: "https://sepolia.base.org",
          feeCollectorAddress: FEE_COLLECTOR,
          aztTokenAddress: AZT_TOKEN,
          requiredConfirmations: 6,
        },
      },
    });
    const { createServer } = await import("../server.js");
    const { app } = createServer(config);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const addr = server.address();
    if (typeof addr === "object" && addr)
      baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(
    () => new Promise<void>((resolve) => server?.close(() => resolve())),
  );

  const post = (body: unknown) =>
    fetch(`${baseUrl}/api/v1/authwit/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("returns valid authwit for legitimate payment", async () => {
    const signature = await signClaimRequest(TX_HASH, CHAIN_ID);
    const res = await post({
      evmTxHash: TX_HASH,
      evmChainId: CHAIN_ID,
      signature,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.amount).toBe("1000000000000000000");
    expect(body.secret).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.authwit.innerHash).toBeDefined();
    expect(body.authwit.outerHash).toBeDefined();
    expect(body.authwit.witness).toBeInstanceOf(Array);
    expect(body.authwit.witness.length).toBe(3);
  });

  it("returns same secret and hashes for same txHash (idempotent)", async () => {
    const signature = await signClaimRequest(TX_HASH, CHAIN_ID);
    const payload = { evmTxHash: TX_HASH, evmChainId: CHAIN_ID, signature };

    const body1 = await (await post(payload)).json();
    const body2 = await (await post(payload)).json();

    expect(body1.secret).toBe(body2.secret);
    expect(body1.authwit.innerHash).toBe(body2.authwit.innerHash);
    expect(body1.authwit.outerHash).toBe(body2.authwit.outerHash);
  });

  it("rejects invalid signature", async () => {
    const otherAccount = privateKeyToAccount(TEST_KEY);
    const badSignature = await otherAccount.signTypedData(
      getTypedDataForSigning(TX_HASH, CHAIN_ID),
    );

    const res = await post({
      evmTxHash: TX_HASH,
      evmChainId: CHAIN_ID,
      signature: badSignature,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_SIGNATURE");
  });

  it("rejects unsupported chain", async () => {
    const signature = await signClaimRequest(TX_HASH, 99999);
    const res = await post({
      evmTxHash: TX_HASH,
      evmChainId: 99999,
      signature,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_CHAIN");
  });

  it("rejects invalid request body", async () => {
    const res = await post({ evmTxHash: "not-hex" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_REQUEST");
  });

  it("health check returns ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.chains).toContain(CHAIN_ID);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await fetch(`${baseUrl}/api/v1/nonexistent`);
    expect(res.status).toBe(404);
  });
});
