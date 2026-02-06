import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { TxStatus } from "@aztec/aztec.js/tx";
import { Fr } from "@aztec/aztec.js/fields";
import { sha256 } from "@noble/hashes/sha256";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  computeInnerAuthWitHash,
  AuthWitness,
} from "@aztec/stdlib/auth-witness";

import { CounterContract, MeteredContract } from "../artifacts/index.js";
import {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
} from "../fee-payment-methods/index.js";
import { deployMeteredContract } from "../utils/deploy.js";

import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  fundL2AddressWithFeeJuiceFromL1,
} from "./harness.js";

import {
  TEST_TIMEOUT,
  deployCounter,
  getGasSetup,
  getGasSetupWithTeardown,
  getBalance,
} from "./utils.js";

const ECDSA_PRIVATE_KEY = 1n;

function getEcdsaPublicKey(privateKey: bigint): {
  x: number[];
  y: number[];
} {
  const uncompressed = secp256k1.getPublicKey(privateKey, false);
  const x = Array.from(uncompressed.slice(1, 33));
  const y = Array.from(uncompressed.slice(33, 65));
  return { x, y };
}

function signEcdsa(messageBytes: Uint8Array, privateKey: bigint): Uint8Array {
  const hashedMessage = sha256(messageBytes);
  const signature = secp256k1.sign(hashedMessage, privateKey);
  const sigBytes = new Uint8Array(64);
  const rBytes = signature.r.toString(16).padStart(64, "0");
  const sBytes = signature.s.toString(16).padStart(64, "0");
  for (let i = 0; i < 32; i++) {
    sigBytes[i] = parseInt(rBytes.slice(i * 2, i * 2 + 2), 16);
    sigBytes[i + 32] = parseInt(sBytes.slice(i * 2, i * 2 + 2), 16);
  }
  return sigBytes;
}

async function createEcdsaAuthWitness(
  secret: Fr,
  amount: bigint,
  contractAddress: AztecAddress,
  chainId: number,
): Promise<AuthWitness> {
  const messageHash = await computeInnerAuthWitHash([
    secret,
    new Fr(amount),
    contractAddress.toField(),
    new Fr(chainId),
  ]);
  const signatureBytes = signEcdsa(messageHash.toBuffer(), ECDSA_PRIVATE_KEY);
  const witnessData = Array.from(signatureBytes).map((b) => new Fr(b));
  return new AuthWitness(messageHash, witnessData);
}

describe("Metered Fee Payment Contract", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let counter: CounterContract;
  let aztecNode: AztecNode;
  let fpc: MeteredContract;
  let chainId: number;
  let paymentMethod: MeteredFeePaymentMethod;
  let exactPaymentMethod: MeteredExactFeePaymentMethod;

  const MINT_AMOUNT = 100_000_000_000_000_000_000n;

  beforeAll(async () => {
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: { dataDirectory: "pxe-test-metered", proverEnabled: false },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;

    // Deploy counter for testing
    counter = await deployCounter(wallet);

    // Deploy and fund the Metered FPC
    const { x: ecdsaPubKeyX, y: ecdsaPubKeyY } =
      getEcdsaPublicKey(ECDSA_PRIVATE_KEY);
    fpc = await deployMeteredContract(
      wallet,
      alice,
      ecdsaPubKeyX,
      ecdsaPubKeyY,
    );
    const { balance } = await fundL2AddressWithFeeJuiceFromL1(
      aztecNode,
      wallet,
      fpc.address,
      {
        claimTxSender: alice,
        produceL2Block: async () => {
          await deployCounter(wallet);
        },
        loggerName: "test:metered",
      },
    );
    expect(balance).toBeGreaterThan(0n);

    chainId = await aztecNode.getChainId();
    paymentMethod = new MeteredFeePaymentMethod(fpc.address);
    exactPaymentMethod = new MeteredExactFeePaymentMethod(fpc.address);
  });

  beforeEach(async () => {
    // Mint internal balance for alice before each test
    const secret = Fr.random();
    const authWitness = await createEcdsaAuthWitness(
      secret,
      MINT_AMOUNT,
      fpc.address,
      chainId,
    );
    await fpc.methods
      .mint(alice, MINT_AMOUNT, secret)
      .with({ authWitnesses: [authWitness] })
      .send({ from: alice })
      .wait();
  });

  // --- pay_fee (no refund) tests ---

  it(
    "pay_fee SUCCESS: sponsors transaction when user has balance",
    async () => {
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);
      const internalBalanceBefore = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetup(aztecNode);

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          fee: {
            paymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait();

      expect(receipt.status).toBe(TxStatus.SUCCESS);

      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);
      const internalBalanceAfter = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      // FPC paid the actual transaction fee
      expect(fpcBalanceAfter).toBeLessThan(fpcBalanceBefore);
      // User's internal balance was debited max gas cost (no refund)
      expect(internalBalanceAfter).toBe(internalBalanceBefore - maxGasCost);
    },
    TEST_TIMEOUT,
  );

  // --- pay_fee_exact (with refund) tests ---

  it(
    "pay_fee_exact SUCCESS: sponsors transaction and refunds unused gas",
    async () => {
      const fpcBalanceBefore = await getBalance(fpc.address, aztecNode);
      const internalBalanceBefore = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });

      const { maxFeesPerGas, gasLimits, teardownGasLimits, maxGasCost } =
        await getGasSetupWithTeardown(aztecNode);

      const receipt = await counter.methods
        .increment()
        .send({
          from: alice,
          fee: {
            paymentMethod: exactPaymentMethod,
            gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
          },
        })
        .wait();

      expect(receipt.status).toBe(TxStatus.SUCCESS);

      const fpcBalanceAfter = await getBalance(fpc.address, aztecNode);
      const internalBalanceAfter = await fpc.methods
        .balance_of(alice)
        .simulate({ from: alice });
      const transactionFee = receipt.transactionFee!;

      // FPC paid the actual transaction fee (includes teardown costs)
      expect(fpcBalanceAfter).toBe(fpcBalanceBefore - transactionFee);

      // User's internal balance was debited maxGasCost upfront, then refunded the difference in teardown
      const expectedBalance = internalBalanceBefore - BigInt(transactionFee);
      expect(internalBalanceAfter).toBe(expectedBalance);
    },
    TEST_TIMEOUT,
  );

  // --- Additional tests ---

  it(
    "pay_fee INVALID: fails when user has insufficient balance (tx not included)",
    async () => {
      const freshCounter = await deployCounter(wallet);
      const { maxFeesPerGas, gasLimits, teardownGasLimits } =
        await getGasSetup(aztecNode);

      // Create a fresh FPC without minting internal balance
      const { x: ecdsaPubKeyX, y: ecdsaPubKeyY } =
        getEcdsaPublicKey(ECDSA_PRIVATE_KEY);
      const freshFpc = await deployMeteredContract(
        wallet,
        alice,
        ecdsaPubKeyX,
        ecdsaPubKeyY,
      );
      await fundL2AddressWithFeeJuiceFromL1(
        aztecNode,
        wallet,
        freshFpc.address,
        {
          claimTxSender: alice,
          produceL2Block: async () => {
            await deployCounter(wallet);
          },
          loggerName: "test:metered-fresh",
        },
      );

      const freshPaymentMethod = new MeteredFeePaymentMethod(freshFpc.address);

      // Should fail because alice has no internal balance
      await expect(
        freshCounter.methods
          .increment()
          .send({
            from: alice,
            fee: {
              paymentMethod: freshPaymentMethod,
              gasSettings: { gasLimits, teardownGasLimits, maxFeesPerGas },
            },
          })
          .wait(),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT,
  );
});
