import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { concatBytes } from "@noble/hashes/utils";
import type { Hex } from "viem";

const DOMAIN_SEPARATOR = "AztecFPC.Secret.v2";
const DOMAIN_BYTES = new TextEncoder().encode(DOMAIN_SEPARATOR);

/** BN254 scalar field modulus */
const BN254_FR_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bigintToBytes32BE(value: number | bigint): Uint8Array {
  const hex = BigInt(value).toString(16).padStart(64, "0");
  return hexToBytes(`0x${hex}`);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class SecretGenerator {
  private signingKey: Uint8Array;

  constructor(spSigningKeyHex: Hex) {
    this.signingKey = hexToBytes(spSigningKeyHex);
  }

  /**
   * Generate deterministic secret from txHash and chainId.
   *
   * Process:
   * 1. Construct message: domain || chainId (32-byte BE) || txHash
   * 2. Hash with keccak256
   * 3. Sign with SP key (deterministic ECDSA via @noble/curves)
   * 4. Take first 32 bytes (r component)
   * 5. Reduce modulo BN254 Fr field
   *
   * @returns Secret as 0x-prefixed 32-byte hex string (zero-padded)
   */
  generateSecret(txHash: Hex, chainId: number): Hex {
    const txHashBytes = hexToBytes(txHash);
    const chainIdBytes = bigintToBytes32BE(chainId);
    const message = concatBytes(DOMAIN_BYTES, chainIdBytes, txHashBytes);
    const messageHash = keccak_256(message);
    const signature = secp256k1.sign(messageHash, this.signingKey);
    const rBytes = signature.toCompactRawBytes().slice(0, 32);
    const secretBigInt = BigInt("0x" + bytesToHex(rBytes)) % BN254_FR_MODULUS;
    return `0x${secretBigInt.toString(16).padStart(64, "0")}` as Hex;
  }
}
