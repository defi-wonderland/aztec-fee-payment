import { type Wallet } from "@aztec/aztec.js/wallet";
import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import {
  Benchmark,
  type BenchmarkContext,
} from "@defi-wonderland/aztec-benchmark";

import { CounterContract } from "../src/ts/artifacts/index.js";
import { MeteredFeePaymentMethod } from "../src/ts/fee-payment-methods/index.js";
import {
  createLocalNetworkContext,
  fundL2AddressWithFeeJuiceFromL1,
  LOCAL_AZTEC_NODE_URL,
} from "../src/ts/test/harness.js";
import { deployCounter } from "../src/ts/test/utils.js";
import { deployMeteredContract } from "../src/ts/utils/deploy.js";

// Extend the BenchmarkContext from the new package
interface CounterBenchmarkContext extends BenchmarkContext {
  wallet: Wallet;
  deployer: AztecAddress;
  accounts: AztecAddress[];
  counterContract: CounterContract;
  feePaymentMethod: FeePaymentMethod;
  meteredFpcAddress: AztecAddress;
}

// Use export default class extending Benchmark
export default class CounterContractBenchmark extends Benchmark {
  /**
   * Sets up the benchmark environment for the CounterContract.
   * Creates PXE client, gets accounts, and deploys the contract.
   */
  async setup(): Promise<CounterBenchmarkContext> {
    const { aztecNode, wallet, accounts, deployer } =
      await createLocalNetworkContext({
        nodeUrl: LOCAL_AZTEC_NODE_URL,
        wallet: { proverEnabled: false },
      });

    const counterContract = await CounterContract.deploy(wallet).send({
      from: deployer,
    });

    // Deploy and fund Metered FPC
    const meteredFpc = await deployMeteredContract(wallet);
    await fundL2AddressWithFeeJuiceFromL1(
      aztecNode,
      wallet,
      meteredFpc.address,
      {
        claimTxSender: deployer,
        produceL2Block: async () => {
          await deployCounter(wallet);
        },
        loggerName: "benchmark:metered",
      },
    );

    // Mint internal balance for deployer
    await meteredFpc.methods
      .mint(deployer, 10_000_000_000_000_000_000n)
      .send({ from: deployer });

    const feePaymentMethod = new MeteredFeePaymentMethod(meteredFpc.address);

    return {
      wallet,
      deployer,
      accounts,
      counterContract,
      feePaymentMethod,
    };
  }

  /**
   * Returns the list of CounterContract methods to be benchmarked.
   */
  getMethods(context: CounterBenchmarkContext): any[] {
    const { counterContract, wallet, deployer, feePaymentMethod } = context;

    return [
      {
        name: "increment",
        interaction: {
          caller: deployer,
          action: counterContract.withWallet(wallet).methods.increment(),
          feePaymentMethod,
        },
      },
    ];
  }
}
