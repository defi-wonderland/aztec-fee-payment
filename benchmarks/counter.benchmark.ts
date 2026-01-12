import { type Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { Fr } from "@aztec/aztec.js/fields";
import { TestWallet } from "@aztec/test-wallet/server";
import {
  Benchmark,
  type BenchmarkContext,
} from "@defi-wonderland/aztec-benchmark";
import { Gas, GasFees } from "@aztec/stdlib/gas";
import { TokenContract } from "@aztec/noir-contracts.js/Token";

import {
  CounterContract,
  UnconditionalContract,
  MeteredContract,
  MeteredTokenContract,
} from "../src/ts/artifacts/index.js";
import {
  UnconditionalFeePaymentMethod,
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredTokenFeePaymentMethod,
  MeteredTokenExactFeePaymentMethod,
} from "../src/ts/fee-payment-methods/index.js";
import {
  createLocalNetworkContext,
  fundL2AddressWithFeeJuiceFromL1,
  LOCAL_AZTEC_NODE_URL,
} from "../src/ts/test/harness.js";
import { deployCounter } from "../src/ts/test/utils.js";
import {
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
} from "../src/ts/utils/gas.js";
import {
  deployUnconditionalContract,
  deployMeteredContract,
  deployMeteredTokenContract,
} from "../src/ts/utils/deploy.js";

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

/**
 * Wraps a ContractFunctionInteraction and injects authWitnesses for token-based fee payment.
 */
class FeeAndAuthWrappedInteraction {
  private nonceCounter = 1n;

  constructor(
    private readonly inner: any,
    private readonly wallet: TestWallet,
    private readonly caller: AztecAddress,
    private readonly fpcAddress: AztecAddress,
    private readonly token: TokenContract,
    private readonly getPaymentMethod: (nonce: Fr) => FeePaymentMethod,
    private readonly buildTokenTransferAction: (args: {
      from: AztecAddress;
      to: AztecAddress;
      amount: bigint;
      nonce: Fr;
    }) => any,
    private readonly gasSettings: {
      gasLimits: Gas;
      teardownGasLimits: Gas;
      maxFeesPerGas: GasFees;
    },
  ) {}

  private nextNonce(): Fr {
    const nonce = new Fr(this.nonceCounter);
    this.nonceCounter += 1n;
    return nonce;
  }

  private async buildOptions(userOptions: any = {}) {
    const nonce = this.nextNonce();
    const paymentMethod = this.getPaymentMethod(nonce);
    const txFrom: AztecAddress = userOptions?.from ?? this.caller;
    const gasSettings = this.gasSettings;

    const maxGasCost = maxGasCostFor(
      gasSettings.maxFeesPerGas,
      gasSettings.gasLimits,
      gasSettings.teardownGasLimits,
    );

    const tokenTransferAction = this.buildTokenTransferAction({
      from: txFrom,
      to: this.fpcAddress,
      amount: maxGasCost,
      nonce,
    });

    const intent = { caller: this.fpcAddress, action: tokenTransferAction };
    const witness = await this.wallet.createAuthWit(txFrom, intent);

    return {
      ...userOptions,
      from: txFrom,
      authWitnesses: [witness],
      fee: {
        ...(userOptions?.fee ?? {}),
        paymentMethod,
        gasSettings,
      },
    };
  }

  async request(options: any = {}) {
    return this.inner.request(await this.buildOptions(options));
  }

  async simulate(options: any = {}) {
    return this.inner.simulate(await this.buildOptions(options));
  }

  async profile(options: any = {}) {
    return this.inner.profile(await this.buildOptions(options));
  }

  send(options: any = {}) {
    return {
      wait: async () => {
        const tx = await this.inner.send(await this.buildOptions(options));
        return tx.wait();
      },
    };
  }
}

// Extend the BenchmarkContext from the new package
interface CounterBenchmarkContext extends BenchmarkContext {
  wallet: Wallet;
  deployer: AztecAddress;
  accounts: AztecAddress[];
  counterContract: CounterContract;
  unconditionalFpc: UnconditionalContract;
  meteredFpc: MeteredContract;
  meteredTokenFpc: MeteredTokenContract;
  tokenContract: TokenContract;
  unconditionalPaymentMethod: UnconditionalFeePaymentMethod;
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

    // Deploy token for token-based FPC
    const tokenContract = await TokenContract.deploy(
      wallet,
      deployer,
      "FeeToken",
      "FEE",
      18n,
    )
      .send({ from: deployer })
      .deployed();

    // Mint tokens to deployer
    await tokenContract.methods
      .mint_to_private(deployer, 1_000_000_000_000_000_000_000_000n)
      .send({ from: deployer })
      .wait();

    // Deploy and fund Unconditional FPC
    const unconditionalFpc = await deployUnconditionalContract(wallet);
    await fundL2AddressWithFeeJuiceFromL1(
      aztecNode,
      wallet,
      unconditionalFpc.address,
      {
        claimTxSender: deployer,
        produceL2Block: async () => {
          await deployCounter(wallet);
        },
        loggerName: "benchmark:unconditional",
      },
    );

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
      .send({ from: deployer })
      .wait();

    // Deploy and fund MeteredToken FPC
    const meteredTokenFpc = await deployMeteredTokenContract(
      wallet,
      tokenContract.address,
    );
    await fundL2AddressWithFeeJuiceFromL1(
      aztecNode,
      wallet,
      meteredTokenFpc.address,
      {
        claimTxSender: deployer,
        produceL2Block: async () => {
          await deployCounter(wallet);
        },
        loggerName: "benchmark:metered-token",
      },
    );

    const unconditionalPaymentMethod = new UnconditionalFeePaymentMethod(
      unconditionalFpc.address,
    );
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
      unconditionalFpc,
      meteredFpc,
      meteredTokenFpc,
      tokenContract,
      unconditionalPaymentMethod,
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
      unconditionalPaymentMethod,
      meteredPaymentMethod,
      meteredExactPaymentMethod,
      meteredTokenFpc,
      tokenContract,
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
        name: "increment_unconditional",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            unconditionalPaymentMethod,
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
      {
        name: "increment_metered_token",
        interaction: {
          caller: deployer,
          action: new FeeAndAuthWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            wallet as TestWallet,
            deployer,
            meteredTokenFpc.address,
            tokenContract,
            (nonce) =>
              new MeteredTokenFeePaymentMethod(meteredTokenFpc.address, nonce),
            ({ from, to, amount, nonce }) =>
              tokenContract
                .withWallet(wallet as TestWallet)
                .methods.transfer_to_public(from, to, amount, nonce),
            gasSettingsNoTeardown,
          ),
        },
      },
      {
        name: "increment_metered_token_exact",
        interaction: {
          caller: deployer,
          action: new FeeAndAuthWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            wallet as TestWallet,
            deployer,
            meteredTokenFpc.address,
            tokenContract,
            (nonce) =>
              new MeteredTokenExactFeePaymentMethod(
                meteredTokenFpc.address,
                nonce,
              ),
            ({ from, to, amount, nonce }) =>
              tokenContract
                .withWallet(wallet as TestWallet)
                .methods.transfer_to_public_and_prepare_private_balance_increase(
                  from,
                  to,
                  amount,
                  nonce,
                ),
            gasSettingsWithTeardown,
          ),
        },
      },
    ];

    return methods;
  }
}
