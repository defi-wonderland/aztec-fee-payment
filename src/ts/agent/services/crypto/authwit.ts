/**
 * Aztec Authwit Generation
 *
 * Generates authorization witnesses (authwits) for mint(amount, secret) operations
 * on the FPC contract.
 *
 * Uses Aztec's standard authwit computation:
 *   inner_hash = computeInnerAuthWitHash([fpcAddress, selector, amount, secret])
 *   outer_hash = computeOuterAuthWitHash(consumer, chainId, version, innerHash)
 *   witness = sign(outer_hash)
 */

import { Fr } from "@aztec/foundation/curves/bn254";
import { GrumpkinScalar } from "@aztec/foundation/curves/grumpkin";
import { Schnorr } from "@aztec/foundation/crypto/schnorr";
import { FunctionSelector } from "@aztec/stdlib/abi";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  computeInnerAuthWitHash,
  computeOuterAuthWitHash,
} from "@aztec/stdlib/auth-witness";
import type { Hex } from "viem";
import type { MintAuthwit } from "../../types/index.js";

/**
 * Compute the function selector for mint(Field, Field)
 */
async function getMintSelector(): Promise<FunctionSelector> {
  return await FunctionSelector.fromSignature("mint(Field,Field)");
}

/**
 * Authwit Generator for FPC mint operations
 */
export class AuthwitGenerator {
  private fpcAddress: AztecAddress;
  private ownerAddress: AztecAddress;
  private ownerSigningKey: GrumpkinScalar;
  private schnorr: Schnorr;
  // Aztec chain ID and version for authwit computation
  private chainId: Fr;
  private version: Fr;

  constructor(config: {
    fpcAddress: string;
    ownerAddress: string;
    ownerSigningKey: Hex;
    chainId?: bigint;
    version?: bigint;
  }) {
    this.fpcAddress = AztecAddress.fromString(config.fpcAddress);
    this.ownerAddress = AztecAddress.fromString(config.ownerAddress);

    // Parse the signing key as Fq (Grumpkin scalar field)
    const keyHex = config.ownerSigningKey.startsWith("0x")
      ? config.ownerSigningKey.slice(2)
      : config.ownerSigningKey;
    this.ownerSigningKey = GrumpkinScalar.fromBuffer(
      Buffer.from(keyHex, "hex"),
    );

    this.schnorr = new Schnorr();

    // Default chain ID and version (can be overridden)
    this.chainId = new Fr(config.chainId ?? 0n);
    this.version = new Fr(config.version ?? 1n);
  }

  /**
   * Generate an authwit for mint(amount, secret)
   *
   * This creates an authwit that authorizes calling mint(amount, secret)
   * on the FPC contract. The authwit is signed by the FPC owner.
   */
  async generateMintAuthwit(
    amount: bigint,
    secretHex: Hex,
  ): Promise<MintAuthwit> {
    // Convert inputs to Fr
    const amountFr = new Fr(amount);
    const secretFr = Fr.fromString(secretHex);

    // Get function selector
    const selector = await getMintSelector();

    // Compute inner hash using Aztec's standard computation
    // inner_hash = H(fpcAddress, selector, args...)
    const innerHash = await computeInnerAuthWitHash([
      this.fpcAddress.toField(),
      selector.toField(),
      amountFr,
      secretFr,
    ]);

    // Compute outer hash
    // outer_hash = H(consumer, chainId, version, innerHash)
    // Consumer is the FPC address (who will verify the authwit)
    const outerHash = await computeOuterAuthWitHash(
      this.fpcAddress,
      this.chainId,
      this.version,
      innerHash,
    );

    // Sign the outer hash with owner's Schnorr key
    const signature = await this.schnorr.constructSignature(
      outerHash.toBuffer(),
      this.ownerSigningKey,
    );

    // Construct the witness array from signature fields
    const witness = signature.toFields().map((f: Fr) => f.toString());

    return {
      amount,
      secret: secretHex,
      innerHash: innerHash.toString(),
      outerHash: outerHash.toString(),
      witness,
    };
  }
}

/**
 * Helper to create authwit response format
 */
export function formatAuthwitResponse(authwit: MintAuthwit) {
  return {
    amount: authwit.amount.toString(),
    secret: authwit.secret,
    authwit: {
      innerHash: authwit.innerHash,
      outerHash: authwit.outerHash,
      witness: authwit.witness,
    },
  };
}
