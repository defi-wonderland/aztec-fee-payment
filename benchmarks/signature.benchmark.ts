import { type Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import {
  Benchmark,
  type BenchmarkContext,
} from "@defi-wonderland/aztec-benchmark";
import { Fr } from "@aztec/aztec.js/fields";
import { sha256 } from "@noble/hashes/sha256";
import { secp256k1 } from "@noble/curves/secp256k1";
import { Schnorr } from "@aztec/foundation/crypto/schnorr";
import { GrumpkinScalar } from "@aztec/foundation/curves/grumpkin";

import { MeteredContract } from "../src/ts/artifacts/index.js";
import {
  createLocalNetworkContext,
  LOCAL_AZTEC_NODE_URL,
} from "../src/ts/test/harness.js";
import { deployMeteredContract } from "../src/ts/utils/deploy.js";
import { computeInnerAuthWitHash } from "@aztec/stdlib/auth-witness";

/**
 * Test private key for ECDSA (secp256k1).
 * Private key = 1 corresponds to the generator point G.
 */
const ECDSA_PRIVATE_KEY = 1n;

/**
 * Test private key for Schnorr (Grumpkin curve).
 * Private key = 1 means public key = generator point G.
 */
const SCHNORR_PRIVATE_KEY = new GrumpkinScalar(1n);

interface SignatureBenchmarkContext extends BenchmarkContext {
  wallet: Wallet;
  deployer: AztecAddress;
  accounts: AztecAddress[];
  meteredContract: MeteredContract;
  schnorrTxHash: Fr;
  schnorrAmount: bigint;
  schnorrSignature: number[];
  ecdsaTxHash: Fr;
  ecdsaAmount: bigint;
  ecdsaSignature: number[];
}

/**
 * Signs a message with Schnorr (Grumpkin curve) using Aztec's implementation.
 * Also logs the public key for verification against Noir contract.
 */
async function signSchnorr(
  messageBytes: Uint8Array,
  privateKey: GrumpkinScalar,
): Promise<Uint8Array> {
  const schnorr = new Schnorr();

  // Compute and log the public key for verification
  const publicKey = await schnorr.computePublicKey(privateKey);
  console.log("Schnorr Public Key X:", publicKey.x.toString());
  console.log("Schnorr Public Key Y:", publicKey.y.toString());

  const signature = await schnorr.constructSignature(messageBytes, privateKey);
  return signature.toBuffer();
}

/**
 * Signs a message with ECDSA (secp256k1).
 * The contract hashes with sha256 before verification.
 */
function signEcdsa(messageBytes: Uint8Array, privateKey: bigint): Uint8Array {
  const hashedMessage = sha256(messageBytes);
  const signature = secp256k1.sign(hashedMessage, privateKey);

  // Return r || s (64 bytes total, big-endian)
  const sigBytes = new Uint8Array(64);
  const rBytes = signature.r.toString(16).padStart(64, "0");
  const sBytes = signature.s.toString(16).padStart(64, "0");

  for (let i = 0; i < 32; i++) {
    sigBytes[i] = parseInt(rBytes.slice(i * 2, i * 2 + 2), 16);
    sigBytes[i + 32] = parseInt(sBytes.slice(i * 2, i * 2 + 2), 16);
  }

  return sigBytes;
}

export default class SignatureVerificationBenchmark extends Benchmark {
  async setup(): Promise<SignatureBenchmarkContext> {
    const { aztecNode, wallet, accounts, deployer } =
      await createLocalNetworkContext({
        nodeUrl: LOCAL_AZTEC_NODE_URL,
        wallet: { proverEnabled: false },
      });

    // Deploy Metered contract
    const meteredContract = await deployMeteredContract(wallet);

    // Get chain ID for message hash computation
    const chainId = await aztecNode.getChainId();

    // Prepare Schnorr signature data
    const schnorrTxHash = Fr.random();
    const schnorrAmount = 1000n;
    const schnorrMessageHash = await computeInnerAuthWitHash([
      schnorrTxHash,
      new Fr(schnorrAmount),
      meteredContract.address.toField(),
      new Fr(chainId),
    ]);
    const schnorrSignature = Array.from(
      await signSchnorr(schnorrMessageHash.toBuffer(), SCHNORR_PRIVATE_KEY),
    );

    // Prepare ECDSA signature data (different txHash to avoid nullifier collision)
    const ecdsaTxHash = Fr.random();
    const ecdsaAmount = 1000n;
    const ecdsaMessageHash = await computeInnerAuthWitHash([
      ecdsaTxHash,
      new Fr(ecdsaAmount),
      meteredContract.address.toField(),
      new Fr(chainId),
    ]);
    const ecdsaSignature = Array.from(
      signEcdsa(ecdsaMessageHash.toBuffer(), ECDSA_PRIVATE_KEY),
    );

    return {
      wallet,
      deployer,
      accounts,
      meteredContract,
      schnorrTxHash,
      schnorrAmount,
      schnorrSignature,
      ecdsaTxHash,
      ecdsaAmount,
      ecdsaSignature,
    };
  }

  getMethods(context: SignatureBenchmarkContext): any[] {
    const {
      meteredContract,
      wallet,
      deployer,
      schnorrTxHash,
      schnorrAmount,
      schnorrSignature,
      ecdsaTxHash,
      ecdsaAmount,
      ecdsaSignature,
    } = context;

    return [
      {
        name: "verify_schnorr_signature",
        interaction: {
          caller: deployer,
          action: meteredContract
            .withWallet(wallet)
            .methods.verify_schnorr_signature(
              schnorrTxHash,
              schnorrAmount,
              schnorrSignature as any,
            ),
        },
      },
      {
        name: "verify_ecdsa_signature",
        interaction: {
          caller: deployer,
          action: meteredContract
            .withWallet(wallet)
            .methods.verify_ecdsa_signature(
              ecdsaTxHash,
              ecdsaAmount,
              ecdsaSignature as any,
            ),
        },
      },
    ];
  }

  async teardown(_context: BenchmarkContext): Promise<void> {
    process.exit(0);
  }
}
