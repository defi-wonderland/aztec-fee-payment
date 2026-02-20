import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import {
  Benchmark,
  type BenchmarkContext,
} from "@defi-wonderland/aztec-benchmark";

import { CounterContract } from "../src/artifacts/Counter.js";
import { MeteredContract } from "../src/artifacts/Metered.js";
import { MeteredFeePaymentMethod } from "../src/ts/fee-payment-methods/index.js";
import {
  createLocalNetworkContext,
  fundL2AddressWithFeeJuiceFromL1,
  LOCAL_AZTEC_NODE_URL,
} from "../src/ts/test/harness.js";
import { deployCounter } from "../src/ts/test/utils.js";
import { deployMeteredContract } from "../src/ts/utils/deploy.js";
import { EmbeddedWallet } from "@aztec/wallets/embedded";

interface MeteredBenchmarkContext extends BenchmarkContext {
  wallet: EmbeddedWallet;
  deployer: AztecAddress;
  accounts: AztecAddress[];
  counterContract: CounterContract;
  feePaymentMethod: FeePaymentMethod;
  meteredFpcAddress: AztecAddress;
}

export default class MeteredContractBenchmark extends Benchmark {
  async setup(): Promise<MeteredBenchmarkContext> {
    const { aztecNode, wallet, accounts, deployer } =
      await createLocalNetworkContext({
        nodeUrl: LOCAL_AZTEC_NODE_URL,
        wallet: { proverEnabled: false },
      });

    const counterContract = await CounterContract.deploy(wallet).send({
      from: deployer,
    });

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
      meteredFpcAddress: meteredFpc.address,
    };
  }

  getMethods(context: MeteredBenchmarkContext): any[] {
    const { counterContract, wallet, deployer } = context;

    return [
      {
        name: "mint",
        interaction: {
          caller: deployer,
          action: counterContract.withWallet(wallet).methods.increment(),
        },
      },
    ];
  }
}
