import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2";
import type { Address, Hex } from "viem";
import type { ISecretGenerator } from "./types.js";

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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class SecretGenerator implements ISecretGenerator {
  private signingKey: Uint8Array;

  constructor(spSigningKeyHex: Hex) {
    this.signingKey = hexToBytes(spSigningKeyHex);
  }

  /**
   * Generate a deterministic secret by signing sha256(txHash || sender) with the SP key.
   *
   * Process:
   * 1. Compute sha256(txHash || sender) to produce 32-byte message
   * 2. Sign with SP key (deterministic ECDSA via RFC 6979)
   * 3. Take first 32 bytes (r component)
   * 4. Reduce modulo BN254 Fr field
   *
   * @returns Secret as 0x-prefixed 32-byte hex string (zero-padded)
   */
  generateSecret(txHash: Hex, sender: Address): Hex {
    const txHashBytes = hexToBytes(txHash);
    const senderBytes = hexToBytes(sender);
    const combined = new Uint8Array(txHashBytes.length + senderBytes.length);
    combined.set(txHashBytes, 0);
    combined.set(senderBytes, txHashBytes.length);
    const message = sha256(combined);
    const signature = secp256k1.sign(message, this.signingKey);
    const rBytes = signature.toCompactRawBytes().slice(0, 32);
    const secretBigInt = BigInt("0x" + bytesToHex(rBytes)) % BN254_FR_MODULUS;
    return `0x${secretBigInt.toString(16).padStart(64, "0")}` as Hex;
  }
}
