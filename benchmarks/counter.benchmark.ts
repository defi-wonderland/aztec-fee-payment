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
import { poseidon2Hash } from "@aztec/foundation/crypto/poseidon";

import { CounterContract, MeteredContract } from "../src/ts/artifacts/index.js";
import {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredMintAndPayFeePaymentMethod,
  MeteredMintAndPayFeeWithBalancePaymentMethod,
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
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
} from "../src/ts/utils/gas.js";
import { deployMeteredContract } from "../src/ts/utils/deploy.js";

/**
 * Creates an AuthWitness for the owner's account contract via the wallet's
 * authwit mechanism. The inner hash is computed from [secret, amount, poseidon2Hash(userSecret)].
 * The wallet's account contract handles the actual signature verification.
 */
async function createAuthWitness(
  wallet: Wallet,
  ownerAddress: AztecAddress,
  secret: Fr,
  amount: bigint,
  userSecret: Fr,
  fpcAddress: AztecAddress,
): Promise<AuthWitness> {
  const hashedUserSecret = await poseidon2Hash([userSecret]);
  const innerHash = await computeInnerAuthWitHash([
    secret,
    new Fr(amount),
    hashedUserSecret,
  ]);
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
  mintAndPayFeeSingleNoteMethod: MeteredMintAndPayFeeWithBalancePaymentMethod;
  mintAndPayFeeTwoNotesMethod: MeteredMintAndPayFeeWithBalancePaymentMethod;
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
    // Pre-mint balance for MeteredFeePaymentMethod and MeteredExactFeePaymentMethod
    // These methods require existing balance in the contract
    // =========================================================================
    const preMintAmount = 10_000_000_000_000_000_000n;
    const preMintSecret = Fr.random();
    const preMintUserSecret = Fr.random();
    const preMintAuthWitness = await createAuthWitness(
      wallet,
      deployer,
      preMintSecret,
      preMintAmount,
      preMintUserSecret,
      meteredFpc.address,
    );

    await meteredFpc.methods
      .mint(deployer, preMintAmount, preMintSecret, preMintUserSecret)
      .with({ authWitnesses: [preMintAuthWitness] })
      .send({ from: deployer })
      .wait();

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
    const mintAmount = 1_000_000_000_000_000n;

    // MintAndPayFee - mints to account and pays fee (simple, no existing notes consumed)
    const mintAndPayFeeSecret = Fr.random();
    const mintAndPayFeeUserSecret = Fr.random();
    const mintAndPayFeeAuthWitness = await createAuthWitness(
      wallet,
      deployer,
      mintAndPayFeeSecret,
      mintAmount,
      mintAndPayFeeUserSecret,
      meteredFpc.address,
    );
    const mintAndPayFeeMethod = new MeteredMintAndPayFeePaymentMethod(
      meteredFpc.address,
      deployer,
      mintAmount,
      mintAndPayFeeSecret,
      mintAndPayFeeUserSecret,
      mintAndPayFeeAuthWitness,
    );

    // MintAndPayFeeWithBalance (single note) - mints enough to cover gas, no existing notes needed
    const mintAndPayFeeSingleSecret = Fr.random();
    const mintAndPayFeeSingleUserSecret = Fr.random();
    const mintAndPayFeeSingleAuthWitness = await createAuthWitness(
      wallet,
      deployer,
      mintAndPayFeeSingleSecret,
      mintAmount,
      mintAndPayFeeSingleUserSecret,
      meteredFpc.address,
    );
    const mintAndPayFeeSingleNoteMethod =
      new MeteredMintAndPayFeeWithBalancePaymentMethod(
        meteredFpc.address,
        deployer,
        mintAmount,
        mintAndPayFeeSingleSecret,
        mintAndPayFeeSingleUserSecret,
        mintAndPayFeeSingleAuthWitness,
      );

    // MintAndPayFeeWithBalance (two notes) - mints small amount, needs to consume existing note too
    // The pre-minted balance from above will be used to cover the deficit
    const smallMintAmount = 1n; // Very small, so mint_and_pay_fee_with_balance must use pre-minted note too
    const mintAndPayFeeTwoNotesSecret = Fr.random();
    const mintAndPayFeeTwoNotesUserSecret = Fr.random();
    const mintAndPayFeeTwoNotesAuthWitness = await createAuthWitness(
      wallet,
      deployer,
      mintAndPayFeeTwoNotesSecret,
      smallMintAmount,
      mintAndPayFeeTwoNotesUserSecret,
      meteredFpc.address,
    );
    const mintAndPayFeeTwoNotesMethod =
      new MeteredMintAndPayFeeWithBalancePaymentMethod(
        meteredFpc.address,
        deployer,
        smallMintAmount,
        mintAndPayFeeTwoNotesSecret,
        mintAndPayFeeTwoNotesUserSecret,
        mintAndPayFeeTwoNotesAuthWitness,
      );

    // MintThenPayFee - two-step flow: mint creates note, then pay_fee consumes it
    const mintThenPayFeeSecret = Fr.random();
    const mintThenPayFeeUserSecret = Fr.random();
    const mintThenPayFeeAuthWitness = await createAuthWitness(
      wallet,
      deployer,
      mintThenPayFeeSecret,
      mintAmount,
      mintThenPayFeeUserSecret,
      meteredFpc.address,
    );
    const mintThenPayFeeMethod = new MeteredMintThenPayFeePaymentMethod(
      meteredFpc.address,
      deployer,
      mintAmount,
      mintThenPayFeeSecret,
      mintThenPayFeeUserSecret,
      mintThenPayFeeAuthWitness,
    );

    // =========================================================================
    // Gas settings
    // =========================================================================
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
      mintAndPayFeeMethod,
      mintAndPayFeeSingleNoteMethod,
      mintAndPayFeeTwoNotesMethod,
      mintThenPayFeeMethod,
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
      mintAndPayFeeMethod,
      mintAndPayFeeSingleNoteMethod,
      mintAndPayFeeTwoNotesMethod,
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
      // MintAndPayFeeWithBalance (single note): mints enough to cover gas, no existing notes needed
      {
        name: "increment_metered_mint_and_pay_fee_with_balance_single_note",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            mintAndPayFeeSingleNoteMethod,
            gasSettingsNoTeardown,
          ),
        },
      },
      // MintAndPayFeeWithBalance (two notes): mints small amount, consumes existing note too
      {
        name: "increment_metered_mint_and_pay_fee_with_balance_two_notes",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            mintAndPayFeeTwoNotesMethod,
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
    process.exit(0);
  }
}
