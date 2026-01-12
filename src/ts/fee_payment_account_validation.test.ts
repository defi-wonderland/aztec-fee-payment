import { describe, it, expect, beforeAll } from "vitest";
import { TestWallet } from "@aztec/test-wallet/server";
import type { AztecNode } from "@aztec/aztec.js/node";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import { getContractClassFromArtifact } from "@aztec/stdlib/contract";
import { Fr } from "@aztec/aztec.js/fields";

// Account contract artifacts for class ID computation
import { SchnorrAccountContractArtifact } from "@aztec/accounts/schnorr";
import { EcdsaKAccountContractArtifact } from "@aztec/accounts/ecdsa";
import { EcdsaKAccountContract } from "@aztec/accounts/ecdsa";

import { deployCounter } from "./utils.js";

import { CounterContract } from "../artifacts/Counter.js";
import { FeePaymentContract } from "../artifacts/FeePayment.js";

import {
  LOCAL_AZTEC_NODE_URL,
  createLocalNetworkContext,
  deployAndFundFeePayer,
} from "./aztec_harness.js";

import { ClassIdValidatedSponsoredFeePaymentMethod } from "./sponsored_fee_payment.js";

import { TEST_TIMEOUT } from "./test_utils/index.js";

describe("Fee Payment with Account Class Validation", () => {
  let wallet: TestWallet;
  let alice: AztecAddress;
  let counter: CounterContract;
  let aztecNode: AztecNode;
  let feePaymentContract: FeePaymentContract;
  let schnorrClassId: Fr;
  let ecdsaClassId: Fr;

  beforeAll(async () => {
    // Create network context with default Schnorr account wallet
    const ctx = await createLocalNetworkContext({
      nodeUrl: LOCAL_AZTEC_NODE_URL,
      wallet: {
        dataDirectory: "pxe-test-account-validation",
        proverEnabled: false,
      },
    });
    aztecNode = ctx.aztecNode;
    wallet = ctx.wallet;
    alice = ctx.deployer;

    // Deploy counter for testing
    counter = await deployCounter(wallet, alice);

    // Deploy and fund the fee payment contract
    const { feePaymentContract: deployedFeePayer, feeJuiceBalance } =
      await deployAndFundFeePayer({
        aztecNode,
        wallet,
        claimTxSender: alice,
        produceL2Block: async () => {
          await deployCounter(wallet, alice);
        },
        loggerName: "test:account-validation",
      });

    expect(feeJuiceBalance).toBeGreaterThan(0n);
    feePaymentContract = deployedFeePayer;

    // Compute contract class IDs for account contracts
    const schnorrClass = await getContractClassFromArtifact(
      SchnorrAccountContractArtifact,
    );
    schnorrClassId = schnorrClass.id;
    console.log(
      `SchnorrAccountContract class ID: ${schnorrClassId.toString()}`,
    );

    const ecdsaClass = await getContractClassFromArtifact(
      EcdsaKAccountContractArtifact,
    );
    ecdsaClassId = ecdsaClass.id;
    console.log(`EcdsaKAccountContract class ID: ${ecdsaClassId.toString()}`);
  });

  /**
   * Test class ID validated sponsorship with matching class (SUCCESS case).
   * The default TestWallet uses SchnorrAccountContract, so passing the Schnorr class ID should succeed.
   *
   * @expected_status SUCCESS
   * @effects Counter increments, sponsor pays protocol fees
   */
  it(
    "class_id_validation: SUCCESS when sender matches expected class",
    async () => {
      const sponsorFeeJuiceBefore = await getFeeJuiceBalance(
        feePaymentContract.address,
        aztecNode,
      );

      // Create fee payment method that validates caller is SchnorrAccountContract
      const classValidatedFeeMethod =
        new ClassIdValidatedSponsoredFeePaymentMethod(
          feePaymentContract.address,
          schnorrClassId,
        );

      // This should succeed because alice (from TestWallet) is a SchnorrAccountContract
      await counter.methods
        .increment()
        .send({
          from: alice,
          fee: { paymentMethod: classValidatedFeeMethod },
        })
        .wait();

      const sponsorFeeJuiceAfter = await getFeeJuiceBalance(
        feePaymentContract.address,
        aztecNode,
      );

      // Verify sponsor paid fees
      expect(sponsorFeeJuiceAfter).toBeLessThan(sponsorFeeJuiceBefore);

      // Verify counter was incremented
      expect(
        await counter.methods.get_counter().simulate({
          from: alice,
        }),
      ).toBe(1n);

      console.log("✅ Transaction succeeded with matching Schnorr class ID");
    },
    TEST_TIMEOUT,
  );

  /**
   * Test class ID validated sponsorship with non-matching class (FAILURE case).
   * The default TestWallet uses SchnorrAccountContract, but we're requiring ECDSA class ID.
   *
   * @expected_status REVERTED
   * @effects Transaction should fail with "Invalid sender class" error
   */
  it(
    "class_id_validation: FAILURE when sender does not match expected class",
    async () => {
      // Reset counter for this test
      await counter.methods.reset().send({ from: alice }).wait();

      // Create fee payment method that requires EcdsaKAccountContract class ID
      // This will fail because alice is a SchnorrAccountContract, not ECDSA
      const classValidatedFeeMethod =
        new ClassIdValidatedSponsoredFeePaymentMethod(
          feePaymentContract.address,
          ecdsaClassId, // Require ECDSA class, but alice is Schnorr
        );

      let errorThrown = false;
      let errorMessage = "";

      try {
        await counter.methods
          .increment()
          .send({
            from: alice,
            fee: { paymentMethod: classValidatedFeeMethod },
          })
          .wait();
      } catch (error: unknown) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`❌ Transaction failed as expected: ${errorMessage}`);
      }

      expect(errorThrown).toBe(true);
      // The error should indicate the class ID mismatch
      expect(errorMessage).toContain("Invalid sender class");

      // Verify counter was NOT incremented (transaction reverted)
      expect(
        await counter.methods.get_counter().simulate({
          from: alice,
        }),
      ).toBe(0n);

      console.log("✅ Transaction correctly rejected due to class ID mismatch");
    },
    TEST_TIMEOUT,
  );
});
