/**
 * Deterministic Secret Generation
 *
 * Generates deterministic secrets from transaction hashes using
 * the Service Provider's signing key.
 *
 * The secret is derived as: secret = sign(keccak256(domain || chainId || txHash)) truncated to Fr field
 *
 * The domain separator and chainId prevent cross-chain replay attacks where
 * the same txHash on different chains would otherwise generate identical secrets.
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { Hex } from "viem";

// Aztec BN254 field modulus (Fr)
// This is the scalar field of the BN254 curve used by Aztec
const BN254_FR_MODULUS = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

// Domain separator for secret derivation v2 (includes chainId for cross-chain replay prevention)
const DOMAIN_SEPARATOR = new TextEncoder().encode("AztecFPC.Secret.v2");

/**
 * Secret Generator using SP signing key
 */
export class SecretGenerator {
  private signingKey: Uint8Array;

  constructor(spSigningKeyHex: Hex) {
    // Remove 0x prefix and convert to bytes
    const keyHex = spSigningKeyHex.startsWith("0x")
      ? spSigningKeyHex.slice(2)
      : spSigningKeyHex;
    this.signingKey = hexToBytes(keyHex);

    // Validate key length
    if (this.signingKey.length !== 32) {
      throw new Error("SP signing key must be 32 bytes");
    }
  }

  /**
   * Generate a deterministic secret from a transaction hash and chain ID.
   *
   * The process:
   * 1. Construct message: domain || chainId (32-byte BE) || txHash
   * 2. Hash the message with keccak256 to get a message hash
   * 3. Sign the message hash with the SP signing key
   * 4. Take the first 32 bytes of the signature
   * 5. Reduce modulo BN254 Fr field to ensure valid Aztec field element
   *
   * Including chainId prevents cross-chain replay attacks where the same
   * txHash on different chains would generate identical secrets.
   *
   * @param txHash - The EVM transaction hash
   * @param chainId - The EVM chain ID
   * @returns Secret as a 0x-prefixed hex string
   */
  generateSecret(txHash: Hex, chainId: number): Hex {
    // Step 1: Construct the message with domain separator and chainId
    const txHashBytes = hexToBytes(
      txHash.startsWith("0x") ? txHash.slice(2) : txHash,
    );

    // Encode chainId as 32-byte big-endian
    const chainIdBytes = new Uint8Array(32);
    let chainIdBigInt = BigInt(chainId);
    for (let i = 31; i >= 0 && chainIdBigInt > 0n; i--) {
      chainIdBytes[i] = Number(chainIdBigInt & 0xffn);
      chainIdBigInt >>= 8n;
    }

    // Concatenate: domain || chainId || txHash
    const message = new Uint8Array(
      DOMAIN_SEPARATOR.length + chainIdBytes.length + txHashBytes.length,
    );
    message.set(DOMAIN_SEPARATOR, 0);
    message.set(chainIdBytes, DOMAIN_SEPARATOR.length);
    message.set(txHashBytes, DOMAIN_SEPARATOR.length + chainIdBytes.length);

    // Step 2: Hash the message
    const messageHash = keccak_256(message);

    // Step 3: Sign with the SP key (deterministic ECDSA signature)
    const signature = secp256k1.sign(messageHash, this.signingKey);

    // Step 4: Get the compact signature (r || s) and take first 32 bytes (r)
    const compactSig = signature.toCompactRawBytes();
    const secretBytes = compactSig.slice(0, 32);

    // Step 5: Convert to bigint and reduce modulo Fr
    const secretBigInt = BigInt("0x" + bytesToHex(secretBytes));
    const secretFr = secretBigInt % BN254_FR_MODULUS;

    // Convert back to 32-byte hex string
    const secretHex = secretFr.toString(16).padStart(64, "0");
    return `0x${secretHex}` as Hex;
  }
}
