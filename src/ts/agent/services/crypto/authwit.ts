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
import type { AuthwitResponse } from "../../types/index.js";

export interface MintAuthwit {
  amount: bigint;
  secret: string;
  innerHash: string;
  outerHash: string;
  witness: string[];
}

export class AuthwitGenerator {
  private fpcAddress: AztecAddress;
  private ownerAddress: AztecAddress;
  private ownerSigningKey: GrumpkinScalar;
  private schnorr: Schnorr;
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
    this.ownerSigningKey = GrumpkinScalar.fromString(config.ownerSigningKey);
    this.schnorr = new Schnorr();
    this.chainId = new Fr(config.chainId ?? 0n);
    this.version = new Fr(config.version ?? 1n);
  }

  async generateMintAuthwit(
    amount: bigint,
    secretHex: Hex,
  ): Promise<MintAuthwit> {
    const amountFr = new Fr(amount);
    const secretFr = new Fr(BigInt(secretHex));

    // Get selector for mint(Field, Field)
    const selector = await FunctionSelector.fromSignature("mint(Field,Field)");
    const selectorFr = selector.toField();

    // Compute inner_hash = H(fpcAddress, selector, amount, secret)
    const innerHash = await computeInnerAuthWitHash([
      this.fpcAddress.toField(),
      selectorFr,
      amountFr,
      secretFr,
    ]);

    // Compute outer_hash = H(consumer, chainId, version, inner_hash)
    const outerHash = await computeOuterAuthWitHash(
      this.fpcAddress,
      this.chainId,
      this.version,
      innerHash,
    );

    // Sign outer_hash with Schnorr on Grumpkin curve
    const signature = await this.schnorr.constructSignature(
      outerHash.toBuffer(),
      this.ownerSigningKey,
    );
    const witnessFields = signature.toFields();

    return {
      amount,
      secret: secretHex,
      innerHash: innerHash.toString(),
      outerHash: outerHash.toString(),
      witness: witnessFields.map((f) => f.toString()),
    };
  }
}

export function formatAuthwitResponse(authwit: MintAuthwit): AuthwitResponse {
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
