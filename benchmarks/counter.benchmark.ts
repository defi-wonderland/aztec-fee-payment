import { type Wallet } from "@aztec/aztec.js/wallet";
import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import {
  Benchmark,
  type BenchmarkContext,
} from "@defi-wonderland/aztec-benchmark";
import { Gas, GasFees } from "@aztec/stdlib/gas";
import { Fr } from "@aztec/foundation/curves/bn254";
import { computeInnerAuthWitHash } from "@aztec/stdlib/auth-witness";

import { CounterContract, MeteredContract } from "../src/ts/artifacts/index.js";
import {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredMintFeePaymentMethod,
} from "../src/ts/fee-payment-methods/index.js";
import {
  createLocalNetworkContext,
  fundL2AddressWithFeeJuiceFromL1,
  LOCAL_AZTEC_NODE_URL,
} from "../src/ts/test/harness.js";
import { deployCounter } from "../src/ts/test/utils.js";
import {
  maxFeesPerGasFromBaseFees,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
} from "../src/ts/utils/gas.js";
import { deployMeteredContract } from "../src/ts/utils/deploy.js";

/**
 * Wraps a ContractFunctionInteraction so the benchmark runner's profiler (which calls
 * request/simulate/profile/send without fee options) always uses a custom FeePaymentMethod.
 */
class FeeWrappedInteraction {
  constructor(
    private readonly inner: any,
    private readonly paymentMethod?: FeePaymentMethod,
    private readonly gasSettings?: {
      gasLimits: Gas;
      teardownGasLimits: Gas;
      maxFeesPerGas: GasFees;
    },
  ) {}

  async request(options: any = {}) {
    const paymentMethod = options?.fee?.paymentMethod ?? this.paymentMethod;
    const gasSettings = this.gasSettings;
    return paymentMethod
      ? this.inner.request({
          ...options,
          fee: { ...(options.fee ?? {}), paymentMethod, gasSettings },
        })
      : this.inner.request(options);
  }

  async simulate(options: any) {
    const paymentMethod = options?.fee?.paymentMethod ?? this.paymentMethod;
    const gasSettings = this.gasSettings;
    return paymentMethod
      ? this.inner.simulate({
          ...options,
          fee: { ...(options.fee ?? {}), paymentMethod, gasSettings },
        })
      : this.inner.simulate(options);
  }

  async profile(options: any) {
    const paymentMethod = options?.fee?.paymentMethod ?? this.paymentMethod;
    const gasSettings = this.gasSettings;
    return paymentMethod
      ? this.inner.profile({
          ...options,
          fee: { ...(options.fee ?? {}), paymentMethod, gasSettings },
        })
      : this.inner.profile(options);
  }

  send(options: any) {
    const paymentMethod = options?.fee?.paymentMethod ?? this.paymentMethod;
    const gasSettings = this.gasSettings;
    return paymentMethod
      ? this.inner.send({
          ...options,
          fee: { ...(options.fee ?? {}), paymentMethod, gasSettings },
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
  meteredFpc: MeteredContract;
  meteredPaymentMethod: MeteredFeePaymentMethod;
  meteredExactPaymentMethod: MeteredExactFeePaymentMethod;
  gasSettingsNoTeardown: {
    gasLimits: Gas;
    teardownGasLimits: Gas;
    maxFeesPerGas: GasFees;
  };
  gasSettingsWithTeardown: {
    gasLimits: Gas;
    teardownGasLimits: Gas;
    maxFeesPerGas: GasFees;
  };
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

    const counterContract = await CounterContract.deploy(wallet)
      .send({ from: deployer })
      .deployed();

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

    // Mint internal balance for deployer using Phase 2 authwit flow
    const mintAmount = 10_000_000_000_000_000_000n;
    const mintSecret = Fr.random();
    const mintInnerHash = await computeInnerAuthWitHash([
      new Fr(mintAmount),
      mintSecret,
    ]);
    const mintAuthWit = await wallet.createAuthWit({
      consumer: meteredFpc.address,
      innerHash: mintInnerHash,
    });
    await wallet.addAuthWitness(mintAuthWit);

    // Gas settings for the mint transaction (no teardown)
    const mintBaseFees: any = await (aztecNode as any).getCurrentBaseFees();
    const mintMaxFeesPerGas = maxFeesPerGasFromBaseFees(mintBaseFees);
    const mintGasSettings = {
      gasLimits: REASONABLE_GAS_LIMITS,
      teardownGasLimits: Gas.from({ l2Gas: 0, daGas: 0 }),
      maxFeesPerGas: mintMaxFeesPerGas,
    };

    const mintPaymentMethod = new MeteredMintFeePaymentMethod(
      meteredFpc.address,
      mintAmount,
      mintSecret,
    );

    // Send a no-op tx with mint as the fee payment method
    await meteredFpc.methods
      .balance_of(deployer)
      .send({
        from: deployer,
        fee: {
          paymentMethod: mintPaymentMethod,
          gasSettings: mintGasSettings,
        },
      })
      .wait();

    const meteredPaymentMethod = new MeteredFeePaymentMethod(
      meteredFpc.address,
    );
    const meteredExactPaymentMethod = new MeteredExactFeePaymentMethod(
      meteredFpc.address,
    );

    // Gas settings
    const baseFees: any = await (aztecNode as any).getCurrentBaseFees();
    const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);

    const gasSettingsNoTeardown = {
      gasLimits: REASONABLE_GAS_LIMITS,
      teardownGasLimits: Gas.from({ l2Gas: 0, daGas: 0 }),
      maxFeesPerGas,
    };

    const gasSettingsWithTeardown = {
      gasLimits: REASONABLE_GAS_LIMITS,
      teardownGasLimits: REASONABLE_TEARDOWN_GAS_LIMITS,
      maxFeesPerGas,
    };

    return {
      wallet,
      deployer,
      accounts,
      counterContract,
      meteredFpc,
      meteredPaymentMethod,
      meteredExactPaymentMethod,
      gasSettingsNoTeardown,
      gasSettingsWithTeardown,
    };
  }

  /**
   * Returns the list of CounterContract methods to be benchmarked.
   */
  getMethods(context: CounterBenchmarkContext): any[] {
    const {
      counterContract,
      wallet,
      deployer,
      meteredPaymentMethod,
      meteredExactPaymentMethod,
      gasSettingsNoTeardown,
      gasSettingsWithTeardown,
    } = context;

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
        name: "increment_metered",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            meteredPaymentMethod,
            gasSettingsNoTeardown,
          ),
        },
      },
      {
        name: "increment_metered_exact",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            meteredExactPaymentMethod,
            gasSettingsWithTeardown,
          ),
        },
      },
    ];

    return methods;
  }

  async teardown(context: BenchmarkContext): Promise<void> {
    process.exit(0);
  }
}
