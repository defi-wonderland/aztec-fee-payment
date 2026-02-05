/**
 * Unit tests for EIP-712 signature verification
 */

import { describe, it, expect } from "vitest";
import { privateKeyToAccount, signTypedData } from "viem/accounts";
import type { Hex, Address } from "viem";
import {
  recoverClaimRequestSigner,
  verifyClaimRequestSignature,
  createEIP712Domain,
  getTypedDataForSigning,
} from "../services/crypto/eip712.js";

describe("EIP-712 Signature Verification", () => {
  // Test private key (DO NOT use in production)
  const testPrivateKey =
    "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as Hex;
  const testAccount = privateKeyToAccount(testPrivateKey);
  const testTxHash =
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;
  const chainId = 8453; // Base

  describe("createEIP712Domain", () => {
    it("creates domain with correct name and version", () => {
      const domain = createEIP712Domain(chainId);

      expect(domain.name).toBe("Aztec FPC Claim");
      expect(domain.version).toBe("1");
      expect(domain.chainId).toBe(chainId);
    });

    it("creates different domains for different chain IDs", () => {
      const domain1 = createEIP712Domain(1);
      const domain2 = createEIP712Domain(8453);

      expect(domain1.chainId).toBe(1);
      expect(domain2.chainId).toBe(8453);
    });
  });

  describe("getTypedDataForSigning", () => {
    it("returns correct typed data structure", () => {
      const typedData = getTypedDataForSigning(testTxHash, chainId);

      expect(typedData.domain.name).toBe("Aztec FPC Claim");
      expect(typedData.domain.version).toBe("1");
      expect(typedData.domain.chainId).toBe(chainId);
      expect(typedData.primaryType).toBe("ClaimRequest");
      expect(typedData.message.txHash).toBe(testTxHash);
      expect(typedData.types.ClaimRequest).toEqual([
        { name: "txHash", type: "bytes32" },
      ]);
    });
  });

  describe("recoverClaimRequestSigner", () => {
    it("recovers correct signer from valid signature", async () => {
      // Sign the message
      const typedData = getTypedDataForSigning(testTxHash, chainId);
      const signature = await signTypedData({
        ...typedData,
        privateKey: testPrivateKey,
      });

      // Recover signer
      const recoveredAddress = await recoverClaimRequestSigner(
        { txHash: testTxHash },
        signature,
        chainId,
      );

      expect(recoveredAddress.toLowerCase()).toBe(
        testAccount.address.toLowerCase(),
      );
    });

    it("recovers different address for different chain IDs", async () => {
      const typedData1 = getTypedDataForSigning(testTxHash, 1);
      const signature1 = await signTypedData({
        ...typedData1,
        privateKey: testPrivateKey,
      });

      const typedData2 = getTypedDataForSigning(testTxHash, 8453);
      const signature2 = await signTypedData({
        ...typedData2,
        privateKey: testPrivateKey,
      });

      // Using signature1 with chainId 8453 should recover a different address
      const recoveredWithWrongChain = await recoverClaimRequestSigner(
        { txHash: testTxHash },
        signature1,
        8453,
      );

      expect(recoveredWithWrongChain.toLowerCase()).not.toBe(
        testAccount.address.toLowerCase(),
      );
    });
  });

  describe("verifyClaimRequestSignature", () => {
    it("verifies valid signature", async () => {
      const typedData = getTypedDataForSigning(testTxHash, chainId);
      const signature = await signTypedData({
        ...typedData,
        privateKey: testPrivateKey,
      });

      const isValid = await verifyClaimRequestSignature(
        { txHash: testTxHash },
        signature,
        testAccount.address,
        chainId,
      );

      expect(isValid).toBe(true);
    });

    it("rejects signature from different signer", async () => {
      const otherPrivateKey =
        "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210" as Hex;
      const typedData = getTypedDataForSigning(testTxHash, chainId);
      const signature = await signTypedData({
        ...typedData,
        privateKey: otherPrivateKey,
      });

      const isValid = await verifyClaimRequestSignature(
        { txHash: testTxHash },
        signature,
        testAccount.address, // Expecting the test account, but signed by other account
        chainId,
      );

      expect(isValid).toBe(false);
    });

    it("rejects signature for different txHash", async () => {
      const typedData = getTypedDataForSigning(testTxHash, chainId);
      const signature = await signTypedData({
        ...typedData,
        privateKey: testPrivateKey,
      });

      const differentTxHash =
        "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" as Hex;

      const isValid = await verifyClaimRequestSignature(
        { txHash: differentTxHash },
        signature,
        testAccount.address,
        chainId,
      );

      expect(isValid).toBe(false);
    });

    it("rejects signature for different chain ID", async () => {
      const typedData = getTypedDataForSigning(testTxHash, chainId);
      const signature = await signTypedData({
        ...typedData,
        privateKey: testPrivateKey,
      });

      const isValid = await verifyClaimRequestSignature(
        { txHash: testTxHash },
        signature,
        testAccount.address,
        1, // Different chain ID
      );

      expect(isValid).toBe(false);
    });
  });
});
