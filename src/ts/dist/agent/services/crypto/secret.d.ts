import type { Address, Hex } from "viem";
export declare class SecretGenerator {
    private signingKey;
    constructor(spSigningKeyHex: Hex);
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
    generateSecret(txHash: Hex, sender: Address): Hex;
}
//# sourceMappingURL=secret.d.ts.map