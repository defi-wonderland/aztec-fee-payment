import { type Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import {
  registerInitialLocalNetworkAccountsInWallet,
  TestWallet,
} from "@aztec/test-wallet/server";
import {
  Benchmark,
  type BenchmarkContext,
} from "@defi-wonderland/aztec-benchmark";

import { CounterContract } from "../src/artifacts/Counter.js";
import { FeePaymentContract } from "../src/artifacts/FeePayment.js";
import {
  MeteredSponsoredFeePaymentMethod,
  MeteredExactSponsoredFeePaymentMethod,
  SponsoredFeePaymentMethod,
} from "../src/ts/sponsored_fee_payment.js";
import { fundL2AddressWithFeeJuiceFromL1 } from "../src/ts/fee_juice_funding.js";

/**
 * Wraps a ContractFunctionInteraction so the benchmark runner's profiler (which calls
 * request/simulate/profile/send without fee options) always uses a custom FeePaymentMethod.
 */
class FeeWrappedInteraction {
  constructor(
    private readonly inner: any,
    private readonly paymentMethod?: FeePaymentMethod,
  ) {}

  async request(options: any = {}) {
    const paymentMethod = options?.fee?.paymentMethod ?? this.paymentMethod;
    return paymentMethod
      ? this.inner.request({
          ...options,
          fee: { ...(options.fee ?? {}), paymentMethod },
        })
      : this.inner.request(options);
  }

  async simulate(options: any) {
    const paymentMethod = options?.fee?.paymentMethod ?? this.paymentMethod;
    return paymentMethod
      ? this.inner.simulate({
          ...options,
          fee: { ...(options.fee ?? {}), paymentMethod },
        })
      : this.inner.simulate(options);
  }

  async profile(options: any) {
    const paymentMethod = options?.fee?.paymentMethod ?? this.paymentMethod;
    return paymentMethod
      ? this.inner.profile({
          ...options,
          fee: { ...(options.fee ?? {}), paymentMethod },
        })
      : this.inner.profile(options);
  }

  send(options: any) {
    const paymentMethod = options?.fee?.paymentMethod ?? this.paymentMethod;
    return paymentMethod
      ? this.inner.send({
          ...options,
          fee: { ...(options.fee ?? {}), paymentMethod },
        })
      : this.inner.send(options);
  }
}

// Extend the BenchmarkContext from the new package
interface CounterBenchmarkContext extends BenchmarkContext {
  wallet: Wallet;
  deployer: AztecAddress;
  accounts: AztecAddress[];
  counterContract: CounterContract;
  feePaymentMethod?: FeePaymentMethod;
  meteredFeePaymentMethod?: FeePaymentMethod;
  meteredExactFeePaymentMethod?: FeePaymentMethod;
}

// Use export default class extending Benchmark
export default class CounterContractBenchmark extends Benchmark {
  /**
   * Sets up the benchmark environment for the CounterContract.
   * Creates PXE client, gets accounts, and deploys the contract.
   */
  async setup(): Promise<CounterBenchmarkContext> {
    const aztecNode = createAztecNodeClient("http://localhost:8080");
    await waitForNode(aztecNode);

    const wallet: TestWallet = await TestWallet.create(aztecNode);
    const accounts: AztecAddress[] =
      await registerInitialLocalNetworkAccountsInWallet(wallet);

    const [deployer] = accounts;

    // Deploy fee payment contract that will sponsor tx fees.
    const feePayerContract = await FeePaymentContract.deploy(wallet)
      .send({ from: deployer })
      .deployed();

    const counterContract = await CounterContract.deploy(wallet, deployer)
      .send({ from: deployer })
      .deployed();

    // Fund the fee payer contract with FeeJuice from L1 and claim on L2.
    // (Required because benchmark runner sends txs internally without us getting to pass send() options.)
    await fundL2AddressWithFeeJuiceFromL1(
      aztecNode,
      wallet,
      feePayerContract.address,
      {
        claimTxSender: deployer,
        produceL2Block: async () => {
          // Produce L2 blocks by sending a tx (deployer has default fee funds).
          await counterContract
            .withWallet(wallet)
            .methods.increment()
            .send({ from: deployer })
            .wait();
        },
        loggerName: "benchmark:fee",
      },
    );

    const feePayerBalance = await getFeeJuiceBalance(
      feePayerContract.address,
      aztecNode,
    );
    if (feePayerBalance <= 0n) {
      throw new Error(
        `Fee payer contract did not receive FeeJuice balance after claim (balance=${feePayerBalance})`,
      );
    }

    // Mint internal balance so `sponsor_metered()` does not underflow.
    await feePayerContract
      .withWallet(wallet)
      .methods.mint_fee_juice(deployer, 10_000_000_000_000_000_000n)
      .send({ from: deployer })
      .wait();

    const feePaymentMethod = new SponsoredFeePaymentMethod(
      feePayerContract.address,
    );
    const meteredFeePaymentMethod = new MeteredSponsoredFeePaymentMethod(
      feePayerContract.address,
    );
    const meteredExactFeePaymentMethod =
      new MeteredExactSponsoredFeePaymentMethod(feePayerContract.address);

    return {
      wallet,
      deployer,
      accounts,
      counterContract,
      feePaymentMethod,
      meteredFeePaymentMethod,
      meteredExactFeePaymentMethod,
    };
  }

  /**
   * Returns the list of CounterContract methods to be benchmarked.
   */
  // NOTE: We intentionally return `any[]` here to avoid TypeScript type incompatibilities caused by
  // @defi-wonderland/aztec-benchmark bundling its own @aztec/* dependency graph (private fields make types non-assignable).
  getMethods(context: CounterBenchmarkContext): any[] {
    const {
      counterContract,
      wallet,
      deployer,
      feePaymentMethod,
      meteredFeePaymentMethod,
      meteredExactFeePaymentMethod,
    } = context;

    // Return a NamedBenchmarkedInteraction so reports are keyed by the *user function* name ("increment"),
    // not by the implicit fee-payment helper call ("sponsor_unconditionally") that gets prepended to the payload.
    const methods = [
      {
        name: "increment",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
          ),
        },
      },
      {
        name: "increment_with_fee",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            feePaymentMethod,
          ),
        },
      },
      {
        name: "increment_metered",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            meteredFeePaymentMethod,
          ),
        },
      },
      {
        name: "increment_metered_exact",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            meteredExactFeePaymentMethod,
          ),
        },
      },
    ];

    return methods;
  }
}
