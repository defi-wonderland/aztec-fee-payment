import type { Hex } from "viem";
export declare class SecretGenerator {
  private signingKey;
  constructor(spSigningKeyHex: Hex);
  /**
   * Generate a deterministic secret by signing the txHash with the SP key.
   *
   * Process:
   * 1. Sign txHash with SP key (deterministic ECDSA via RFC 6979)
   * 2. Take first 32 bytes (r component)
   * 3. Reduce modulo BN254 Fr field
   *
   * @returns Secret as 0x-prefixed 32-byte hex string (zero-padded)
   */
  generateSecret(txHash: Hex): Hex;
}
//# sourceMappingURL=secret.d.ts.map
