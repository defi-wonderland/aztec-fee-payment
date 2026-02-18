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

import { CounterContract, MeteredContract } from "../src/ts/artifacts/index.js";
import {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredMintAndPayFeePaymentMethod,
  MeteredMintThenPayFeePaymentMethod,
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
  ESTIMATION_GAS_LIMITS,
  ESTIMATION_TEARDOWN_GAS_LIMITS,
} from "../src/ts/utils/gas.js";
import { deployMeteredContract } from "../src/ts/utils/deploy.js";

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
  // Existing payment methods (require pre-minted balance)
  meteredPaymentMethod: MeteredFeePaymentMethod;
  meteredExactPaymentMethod: MeteredExactFeePaymentMethod;
  // Payment methods with account contract authwit verification
  mintAndPayFeeMethod: MeteredMintAndPayFeePaymentMethod;
  mintThenPayFeeMethod: MeteredMintThenPayFeePaymentMethod;
  // Gas settings (uses estimation limits — see comment in setup())
  gasSettings: {
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

    // Deploy and fund Metered FPC (deployer is the owner who authorizes mints)
    const meteredFpc = await deployMeteredContract(wallet, deployer);
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

    // =========================================================================
    // Gas settings
    //
    // The profiler calls simulate({ estimateGas: true }) before send(). The
    // wallet's completeFeeOptionsForEstimation OVERRIDES any user-provided gas
    // limits with hard-coded estimation constants, so the values passed to
    // FeeWrappedInteraction are ignored during simulation. We use those same
    // estimation limits here so maxGasCost (and note sizing) matches what the
    // contract actually sees at runtime.
    // =========================================================================
    const baseFees: any = await (aztecNode as any).getCurrentBaseFees();
    const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);

    const gasSettings = {
      gasLimits: ESTIMATION_GAS_LIMITS,
      teardownGasLimits: ESTIMATION_TEARDOWN_GAS_LIMITS,
      maxFeesPerGas,
    };

    const maxGasCost = maxGasCostFor(
      maxFeesPerGas,
      ESTIMATION_GAS_LIMITS,
      ESTIMATION_TEARDOWN_GAS_LIMITS,
    );

    // =========================================================================
    // Create payment methods
    // =========================================================================
    const meteredPaymentMethod = new MeteredFeePaymentMethod(
      meteredFpc.address,
    );
    const meteredExactPaymentMethod = new MeteredExactFeePaymentMethod(
      meteredFpc.address,
    );

    // MintAndPayFee – mints to account and pays fee in one call.
    // 3x covers the fee and leaves a 2x change note, enough for later benchmark cases.
    const mintAmount = maxGasCost * 3n;
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

    // MintThenPayFee – two-step: mint creates a note, then pay_fee consumes
    // from the total balance.
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
    // Mint small notes to benchmark recursion in increment_metered_ten_notes,
    // which runs first so only these notes exist.
    //
    // NUM_SMALL_NOTES notes are used. Recursion starts at the third note, since
    // INITIAL_TRANSFER_CALL_MAX_NOTES = 2.
    // Afterwards recursion happens every RECURSIVE_TRANSFER_CALL_MAX_NOTES = 8
    //
    // Later tests get balance from increment_mint_and_pay_fee's change note.
    // =========================================================================
    const NUM_SMALL_NOTES = 10;
    const smallNoteValue = maxGasCost / BigInt(NUM_SMALL_NOTES) + 1n;

    for (let i = 0; i < NUM_SMALL_NOTES; i++) {
      const secret = Fr.random();
      const authWit = await createAuthWitness(
        wallet,
        deployer,
        secret,
        smallNoteValue,
        meteredFpc.address,
      );
      await meteredFpc.methods
        .mint(deployer, smallNoteValue, secret)
        .with({ authWitnesses: [authWit] })
        .send({ from: deployer })
        .wait();
    }

    return {
      wallet,
      deployer,
      accounts,
      counterContract,
      meteredFpc,
      meteredPaymentMethod,
      meteredExactPaymentMethod,
      mintAndPayFeeMethod,
      mintThenPayFeeMethod,
      gasSettings,
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
      mintAndPayFeeMethod,
      mintThenPayFeeMethod,
      gasSettings,
    } = context;

    // Methods are ordered so that note state flows correctly:
    //   1. increment                – baseline, no notes consumed
    //   2. increment_many_notes     – runs when ONLY small notes exist → recursion
    //   3. increment_mint_and_pay   – self-contained; large change note funds later tests
    //   4. increment_mint_then_pay  – mints + pay_fee from balance
    //   5. increment_metered        – pay_fee from balance (big change note)
    //   6. increment_metered_exact  – pay_fee_exact with teardown refund (last)
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
      // Many small notes: forces recursion in _subtract_balance because
      // only small notes exist at this point and the initial 2-note batch
      // can't cover maxGasCost
      {
        name: "increment_metered_ten_notes",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            meteredPaymentMethod,
            gasSettings,
          ),
        },
      },
      // MintAndPayFee: mints a large amount, change note (amount - maxGasCost)
      // provides balance for increment_metered and increment_metered_exact below
      {
        name: "increment_metered_mint_and_pay_fee",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            mintAndPayFeeMethod,
            gasSettings,
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
            gasSettings,
          ),
        },
      },
      // Metered: uses balance from mint_and_pay_fee change note (no teardown)
      {
        name: "increment_metered",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            meteredPaymentMethod,
            gasSettings,
          ),
        },
      },
      // Metered Exact: uses balance with teardown refund (last, since refund
      // creates a partial note that doesn't affect earlier tests)
      {
        name: "increment_metered_exact",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            meteredExactPaymentMethod,
            gasSettings,
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
