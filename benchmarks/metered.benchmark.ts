import { type Wallet } from "@aztec/aztec.js/wallet";
import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import {
  Benchmark,
  type BenchmarkContext,
} from "@defi-wonderland/aztec-benchmark";
import { Gas, GasFees } from "@aztec/stdlib/gas";
import { Fr } from "@aztec/aztec.js/fields";
import {
  computeInnerAuthWitHash,
  type AuthWitness,
} from "@aztec/stdlib/auth-witness";
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import {
  registerInitialLocalNetworkAccountsInWallet,
  TestWallet,
} from "@aztec/test-wallet/server";
import { getPXEConfig } from "@aztec/pxe/config";
import { Barretenberg } from "@aztec/bb.js";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

import { CounterContract } from "../src/artifacts/Counter.js";
import { MeteredContract } from "../src/artifacts/Metered.js";
import {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredMintAndPayFeePaymentMethod,
  MeteredMintThenPayFeePaymentMethod,
} from "../src/ts/fee-payment-methods/index.js";
import { fundL2AddressWithFeeJuiceFromL1 } from "../src/ts/test/harness.js";
import { deployCounter } from "../src/ts/test/utils.js";
import {
  maxFeesPerGasFromBaseFees,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
} from "../src/ts/utils/gas.js";
import { deployMeteredContract } from "../src/ts/utils/deploy.js";

const { NODE_URL = "http://localhost:8080" } = process.env;
const node = createAztecNodeClient(NODE_URL);
await waitForNode(node);
const pxeConfig = getPXEConfig();

/**
 * Creates an AuthWitness for the owner's account contract via the wallet's
 * authwit mechanism. The inner hash is computed from [secret, amount].
 * The wallet's account contract handles the actual signature verification.
 */
async function createAuthWitness(
  wallet: Wallet,
  ownerAddress: AztecAddress,
  secret: Fr,
  amount: bigint,
  fpcAddress: AztecAddress,
): Promise<AuthWitness> {
  const innerHash = await computeInnerAuthWitHash([secret, new Fr(amount)]);
  const intent = { consumer: fpcAddress, innerHash };
  return wallet.createAuthWit(ownerAddress, intent);
}

/**
 * Wraps a ContractFunctionInteraction so the benchmark profiler (which calls
 * request/simulate/profile/send) always uses a per-interaction FeePaymentMethod
 * and gas settings. Needed because the profiler only supports a single global
 * feePaymentMethod, but benchmarks require different methods per interaction.
 *
 * In v4, request() only accepts paymentMethod in its fee option (gas settings are
 * resolved later by toSendOptions/toSimulateOptions), so we separate the two.
 */
class FeeWrappedInteraction {
  constructor(
    private readonly inner: any,
    private readonly paymentMethod?: FeePaymentMethod,
    private readonly gasSettings?: {
      gasLimits: Gas;
      teardownGasLimits: Gas;
      maxFeesPerGas: GasFees;
      maxPriorityFeesPerGas?: GasFees;
    },
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

  async simulate(options: any = {}) {
    return this.inner.simulate(this.withFee(options));
  }

  async profile(options: any = {}) {
    return this.inner.profile(this.withFee(options));
  }

  async send(options: any = {}) {
    return this.inner.send(this.withFee(options));
  }

  private withFee(options: any): any {
    const paymentMethod = options?.fee?.paymentMethod ?? this.paymentMethod;
    if (!paymentMethod) return options;
    return {
      ...options,
      fee: {
        ...(options.fee ?? {}),
        paymentMethod,
        ...(this.gasSettings && { gasSettings: this.gasSettings }),
      },
    };
  }
}

// Extend the BenchmarkContext from the new package
interface MeteredBenchmarkContext extends BenchmarkContext {
  cleanup: () => Promise<void>;
  wallet: TestWallet;
  deployer: AztecAddress;
  accounts: AztecAddress[];
  counterContract: CounterContract;
  meteredFpc: MeteredContract;
  // Existing payment methods (require pre-minted balance)
  meteredPaymentMethod: MeteredFeePaymentMethod;
  meteredExactPaymentMethod: MeteredExactFeePaymentMethod;
  // Payment methods with account contract authwit verification
  mintAndPayFeeMethod: MeteredMintAndPayFeePaymentMethod;
  mintThenPayFeeMethod: MeteredMintThenPayFeePaymentMethod;
  // Gas settings
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
  async setup(): Promise<MeteredBenchmarkContext> {
    await Barretenberg.destroySingleton();

    const dataDirectory = join(
      tmpdir(),
      `aztec-metered-${randomBytes(8).toString("hex")}`,
    );
    const wallet = await TestWallet.create(node, {
      ...pxeConfig,
      dataDirectory,
      proverEnabled: false,
    });
    const accounts = await registerInitialLocalNetworkAccountsInWallet(wallet);
    const [deployer] = accounts;

    const cleanup = async () => {
      await wallet.stop();
      try {
        rmSync(dataDirectory, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    };

    const counterContract = await CounterContract.deploy(wallet).send({
      from: deployer,
    });

    // Deploy and fund Metered FPC (deployer is the owner who authorizes mints)
    const meteredFpc = await deployMeteredContract(wallet, deployer);
    await fundL2AddressWithFeeJuiceFromL1(node, wallet, meteredFpc.address, {
      claimTxSender: deployer,
      produceL2Block: async () => {
        await deployCounter(wallet);
      },
      loggerName: "benchmark:metered",
    });

    // =========================================================================
    // Pre-mint balance for MeteredFeePaymentMethod and MeteredExactFeePaymentMethod
    // These methods require existing balance in the contract
    // =========================================================================
    const preMintAmount = 100_000_000_000_000_000_000n;
    const preMintSecret = Fr.random();
    const preMintAuthWitness = await createAuthWitness(
      wallet,
      deployer,
      preMintSecret,
      preMintAmount,
      meteredFpc.address,
    );

    await meteredFpc.methods
      .mint(deployer, preMintAmount, preMintSecret)
      .with({ authWitnesses: [preMintAuthWitness] })
      .send({ from: deployer });

    // =========================================================================
    // Create payment methods
    // =========================================================================
    const meteredPaymentMethod = new MeteredFeePaymentMethod(
      meteredFpc.address,
    );
    const meteredExactPaymentMethod = new MeteredExactFeePaymentMethod(
      meteredFpc.address,
    );

    // Amount to mint in fee payment - should cover gas costs
    const mintAmount = 1_000_000_000_000_000_000n;

    // MintAndPayFee - mints to account and pays fee (simple, no existing notes consumed)
    const mintAndPayFeeSecret = Fr.random();
    const mintAndPayFeeAuthWitness = await createAuthWitness(
      wallet,
      deployer,
      mintAndPayFeeSecret,
      mintAmount,
      meteredFpc.address,
    );
    const mintAndPayFeeMethod = new MeteredMintAndPayFeePaymentMethod(
      meteredFpc.address,
      deployer,
      mintAmount,
      mintAndPayFeeSecret,
      mintAndPayFeeAuthWitness,
    );

    // MintThenPayFee - two-step flow: mint creates note, then pay_fee consumes it
    const mintThenPayFeeSecret = Fr.random();
    const mintThenPayFeeAuthWitness = await createAuthWitness(
      wallet,
      deployer,
      mintThenPayFeeSecret,
      mintAmount,
      meteredFpc.address,
    );
    const mintThenPayFeeMethod = new MeteredMintThenPayFeePaymentMethod(
      meteredFpc.address,
      deployer,
      mintAmount,
      mintThenPayFeeSecret,
      mintThenPayFeeAuthWitness,
    );

    // =========================================================================
    // Gas settings
    // =========================================================================
    const baseFees: any = await (node as any).getCurrentMinFees();
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
      cleanup,
      wallet,
      deployer,
      accounts,
      counterContract,
      meteredFpc,
      meteredPaymentMethod,
      meteredExactPaymentMethod,
      mintAndPayFeeMethod,
      mintThenPayFeeMethod,
      gasSettingsNoTeardown,
      gasSettingsWithTeardown,
    };
  }

  /**
   * Returns the list of CounterContract methods to be benchmarked.
   */
  getMethods(context: MeteredBenchmarkContext): any[] {
    const {
      counterContract,
      wallet,
      deployer,
      meteredPaymentMethod,
      meteredExactPaymentMethod,
      mintAndPayFeeMethod,
      mintThenPayFeeMethod,
      gasSettingsNoTeardown,
      gasSettingsWithTeardown,
    } = context;

    const methods = [
      // Baseline: no custom fee payment
      {
        name: "increment",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
          ),
        },
      },
      // Metered: uses pre-minted balance (no teardown refund)
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
      // Metered Exact: uses pre-minted balance with teardown refund
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
      // MintAndPayFee: simple mint + pay, no existing notes consumed
      {
        name: "increment_metered_mint_and_pay_fee",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            mintAndPayFeeMethod,
            gasSettingsNoTeardown,
          ),
        },
      },
      // MintThenPayFee: two-step flow - mint creates note, pay_fee consumes it
      {
        name: "increment_metered_mint_then_pay_fee",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            mintThenPayFeeMethod,
            gasSettingsNoTeardown,
          ),
        },
      },
    ];

    return methods;
  }

  async teardown(context: BenchmarkContext): Promise<void> {
    await (context as MeteredBenchmarkContext).cleanup();
  }
}
