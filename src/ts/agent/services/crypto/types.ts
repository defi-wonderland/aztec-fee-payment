import type { Address, Hex } from "viem";
import type { MintAuthwit } from "./authwit.js";

/**
 * Generates deterministic secrets from EVM transaction data.
 * Local mode is sync; Lambda mode will be async — callers must always `await`.
 */
export interface ISecretGenerator {
  generateSecret(txHash: Hex, sender: Address): Hex | Promise<Hex>;
}

/**
 * Generates Aztec authwits (authorization witnesses) for mint operations.
 */
export interface IAuthwitGenerator {
  generateMintAuthwit(amount: bigint, secretHex: Hex): Promise<MintAuthwit>;
}
