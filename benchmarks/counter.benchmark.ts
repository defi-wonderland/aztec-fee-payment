import { type Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import { Fr } from "@aztec/aztec.js/fields";
import { TestWallet } from "@aztec/test-wallet/server";
import {
  Benchmark,
  type BenchmarkContext,
} from "@defi-wonderland/aztec-benchmark";
import { Gas, GasFees } from "@aztec/stdlib/gas";
import {
  GAS_ESTIMATION_DA_GAS_LIMIT,
  GAS_ESTIMATION_L2_GAS_LIMIT,
} from "@aztec/constants";

import { CounterContract } from "../src/artifacts/Counter.js";
import { FeePaymentContract } from "../src/artifacts/FeePayment.js";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import {
  MeteredSponsoredFeePaymentMethod,
  MeteredExactSponsoredFeePaymentMethod,
  MeteredTokenSponsoredFeePaymentMethod,
  MeteredExactTokenSponsoredFeePaymentMethod,
  SponsoredFeePaymentMethod,
} from "../src/ts/sponsored_fee_payment.js";
import {
  createLocalNetworkContext,
  deployAndFundFeePayer,
  LOCAL_AZTEC_NODE_URL,
  maxFeesPerGasFromBaseFees,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
} from "../src/ts/aztec_harness.js";
import { buildTokenSponsorshipTransferAction } from "../src/ts/token_sponsorship.js";

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

/**
 * Wraps a ContractFunctionInteraction and injects:
 * - a custom FeePaymentMethod, AND
 * - authWitnesses (for token-sponsored fee payment), AND
 * - fee.gasSettings (so authwit amount matches the contract's max gas cost math).
 */
class FeeAndAuthWrappedInteraction {
  private nonceCounter = 1n;

  constructor(
    private readonly inner: any,
    private readonly wallet: TestWallet,
    private readonly caller: AztecAddress,
    private readonly feePayer: AztecAddress,
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
    // Deterministic, cheap nonce generation for repeated benchmark iterations.
    const nonce = new Fr(this.nonceCounter);
    this.nonceCounter += 1n;
    return nonce;
  }

  private async buildOptions(userOptions: any = {}) {
    const nonce = this.nextNonce();
    // IMPORTANT: For token-sponsored fee payment, the authwit must match the *exact* call
    // the FeePayment contract will make (including the nonce embedded in the fee method args).
    // Therefore we must generate both the payment method and the authwit from the same nonce
    // and not allow callers to override the payment method.
    const paymentMethod = this.getPaymentMethod(nonce);

    const txFrom: AztecAddress = userOptions?.from ?? this.caller;

    // IMPORTANT: The token `amount` we authorize must match the FeePayment contract's
    // `max_gas_cost` computation, which depends on the tx's gas settings.
    // The benchmark framework may supply its own fee options; to keep authwits stable,
    // we always force the known-good gas settings we built during setup.
    const gasSettings = this.gasSettings;

    // When `estimateGas: true`, the wallet will run the tx with fixed, "unreasonably high"
    // gas limits (GAS_ESTIMATION_* constants). The FeePayment contract reads those limits
    // from the tx settings, so we must size the authwit to those limits during estimation,
    // otherwise Token.transfer_to_public will reject with "Unknown auth witness".
    const isEstimatingGas = Boolean(userOptions?.fee?.estimateGas);
    const gasLimitsForCost = isEstimatingGas
      ? {
          daGas: GAS_ESTIMATION_DA_GAS_LIMIT,
          l2Gas: GAS_ESTIMATION_L2_GAS_LIMIT,
        }
      : gasSettings.gasLimits;

    const maxGasCost =
      BigInt(gasSettings.maxFeesPerGas.feePerDaGas) *
        BigInt(gasLimitsForCost.daGas) +
      BigInt(gasSettings.maxFeesPerGas.feePerL2Gas) *
        BigInt(gasLimitsForCost.l2Gas);

    const tokenTransferAction = this.buildTokenTransferAction({
      from: txFrom,
      to: this.feePayer,
      amount: maxGasCost,
      nonce,
    });

    const intent = { caller: this.feePayer, action: tokenTransferAction };
    const witness = await this.wallet.createAuthWit(txFrom, intent);

    return {
      ...userOptions,
      from: txFrom,
      // Override any benchmark-framework-provided authwits (they may not be full AuthWitness objects),
      // and ensure the exact witness needed for the token call is present.
      authWitnesses: [witness],
      // Profiling should focus on circuit costs, not tx validity checks (which can be expensive and flaky).
      // The benchmark framework doesn't set this, so we do it here to keep token-sponsored profiling stable.
      ...(userOptions?.profileMode
        ? { skipTxValidation: true, skipFeeEnforcement: true }
        : {}),
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
    // The benchmark framework expects `send(...).wait()` without awaiting `send()`.
    // Since we need async work (authwit creation) to build options, we return a small
    // wrapper that provides a `wait()` method matching the expected shape.
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
  feePayerAddress: AztecAddress;
  tokenContract: TokenContract;
  feePaymentMethod?: FeePaymentMethod;
  meteredFeePaymentMethod?: FeePaymentMethod;
  meteredExactFeePaymentMethod?: FeePaymentMethod;
  tokenMeteredGasSettings: {
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
        // Keep the benchmark focused on simulation/profiling and avoid prover-related heavy paths.
        wallet: { proverEnabled: false },
      });

    const counterContract = await CounterContract.deploy(wallet, deployer)
      .send({ from: deployer })
      .deployed();

    const tokenContract = await TokenContract.deploy(
      wallet,
      deployer,
      "FeeToken",
      "FEE",
      18n,
    )
      .send({ from: deployer })
      .deployed();

    // Deploy + fund fee payer with FeeJuice from L1, then claim on L2.
    // (Required because the benchmark runner sends txs internally without us getting to pass send() options.)
    const {
      feePaymentContract: feePayerContract,
      feeJuiceBalance: feePayerBalance,
    } = await deployAndFundFeePayer({
      aztecNode,
      wallet,
      claimTxSender: deployer,
      produceL2Block: async () => {
        await counterContract
          .withWallet(wallet)
          .methods.increment()
          .send({ from: deployer })
          .wait();
      },
      loggerName: "benchmark:fee",
    });
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

    // Mint private token balance so token-sponsored fee payment can pull max gas cost repeatedly.
    await tokenContract
      .withWallet(wallet)
      .methods.mint_to_private(deployer, 1_000_000_000_000_000_000_000_000n)
      .send({ from: deployer })
      .wait();
    await tokenContract
      .withWallet(wallet)
      .methods.sync_private_state()
      .simulate({ from: deployer });

    const feePaymentMethod = new SponsoredFeePaymentMethod(
      feePayerContract.address,
    );
    const meteredFeePaymentMethod = new MeteredSponsoredFeePaymentMethod(
      feePayerContract.address,
    );
    const meteredExactFeePaymentMethod =
      new MeteredExactSponsoredFeePaymentMethod(feePayerContract.address);

    // For token-sponsored fee payment we must provide gas settings (so maxGasCost is known for authwit).
    const baseFees: any = await (aztecNode as any).getCurrentBaseFees();
    const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);
    const tokenMeteredGasSettings = {
      gasLimits: REASONABLE_GAS_LIMITS,
      teardownGasLimits: REASONABLE_TEARDOWN_GAS_LIMITS,
      maxFeesPerGas,
    };

    return {
      wallet,
      deployer,
      accounts,
      counterContract,
      feePayerAddress: feePayerContract.address,
      tokenContract,
      feePaymentMethod,
      meteredFeePaymentMethod,
      meteredExactFeePaymentMethod,
      tokenMeteredGasSettings,
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
      feePayerAddress,
      feePaymentMethod,
      meteredFeePaymentMethod,
      meteredExactFeePaymentMethod,
      tokenContract,
      tokenMeteredGasSettings,
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
      {
        name: "increment_metered_token",
        interaction: {
          caller: deployer,
          action: new FeeAndAuthWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            wallet as TestWallet,
            deployer,
            feePayerAddress,
            tokenContract,
            (nonce) =>
              new MeteredTokenSponsoredFeePaymentMethod(
                feePayerAddress,
                tokenContract.address,
                nonce,
              ),
            ({ from, to, amount, nonce }) =>
              buildTokenSponsorshipTransferAction({
                kind: "metered",
                token: tokenContract,
                wallet: wallet as TestWallet,
                from,
                to,
                amount,
                nonce,
              }),
            tokenMeteredGasSettings,
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
            feePayerAddress,
            tokenContract,
            (nonce) =>
              new MeteredExactTokenSponsoredFeePaymentMethod(
                feePayerAddress,
                tokenContract.address,
                nonce,
              ),
            ({ from, to, amount, nonce }) =>
              buildTokenSponsorshipTransferAction({
                kind: "metered_exact",
                token: tokenContract,
                wallet: wallet as TestWallet,
                from,
                to,
                amount,
                nonce,
              }),
            tokenMeteredGasSettings,
          ),
        },
      },
    ];

    return methods;
  }
}
