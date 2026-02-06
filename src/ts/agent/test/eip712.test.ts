import { describe, it, expect } from "vitest";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  recoverClaimRequestSigner,
  verifyClaimRequestSignature,
  getTypedDataForSigning,
} from "../services/crypto/eip712.js";
import { TEST_KEY, OTHER_KEY, TX_HASH, CHAIN_ID } from "./helpers.js";

const account = privateKeyToAccount(TEST_KEY);

async function signClaimRequest(
  txHash: Hex,
  chainId: number,
  privKey: Hex = TEST_KEY,
): Promise<Hex> {
  return privateKeyToAccount(privKey).signTypedData(
    getTypedDataForSigning(txHash, chainId),
  );
}

describe("EIP-712", () => {
  it("recovers the correct signer address", async () => {
    const signature = await signClaimRequest(TX_HASH, CHAIN_ID);
    const recovered = await recoverClaimRequestSigner(
      { txHash: TX_HASH },
      signature,
      CHAIN_ID,
    );
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("verifies a valid signature", async () => {
    const signature = await signClaimRequest(TX_HASH, CHAIN_ID);
    const valid = await verifyClaimRequestSignature(
      { txHash: TX_HASH },
      signature,
      account.address,
      CHAIN_ID,
    );
    expect(valid).toBe(true);
  });

  it("rejects a signature from a different signer", async () => {
    const signature = await signClaimRequest(TX_HASH, CHAIN_ID, OTHER_KEY);
    const valid = await verifyClaimRequestSignature(
      { txHash: TX_HASH },
      signature,
      account.address,
      CHAIN_ID,
    );
    expect(valid).toBe(false);
  });

  it("produces different signatures for different chainIds", async () => {
    const sig1 = await signClaimRequest(TX_HASH, 84532);
    const sig2 = await signClaimRequest(TX_HASH, 8453);
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different txHashes", async () => {
    const other =
      "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
    const sig1 = await signClaimRequest(TX_HASH, CHAIN_ID);
    const sig2 = await signClaimRequest(other, CHAIN_ID);
    expect(sig1).not.toBe(sig2);
  });

  it("getTypedDataForSigning returns correct structure", () => {
    const data = getTypedDataForSigning(TX_HASH, CHAIN_ID);
    expect(data.domain.name).toBe("Aztec FPC Claim");
    expect(data.domain.version).toBe("1");
    expect(data.domain.chainId).toBe(CHAIN_ID);
    expect(data.primaryType).toBe("ClaimRequest");
    expect(data.message.txHash).toBe(TX_HASH);
  });
});
