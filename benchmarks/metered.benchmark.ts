import { type Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import {
  Benchmark,
  type BenchmarkContext,
  type NamedBenchmarkedInteraction,
  type FeeGasSettings,
  namedMethod,
} from "@defi-wonderland/aztec-benchmark";
import { Fr } from "@aztec/aztec.js/fields";
import {
  computeInnerAuthWitHash,
  type AuthWitness,
} from "@aztec/stdlib/auth-witness";
import {
  createAztecNodeClient,
  waitForNode,
  type AztecNode,
} from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { registerInitialLocalNetworkAccountsInWallet } from "@aztec/wallets/testing";
import { getPXEConfig } from "@aztec/pxe/config";
import { Barretenberg } from "@aztec/bb.js";
import { z } from "zod";

import { CounterContract } from "../src/artifacts/Counter.js";
import { MeteredFPCContract } from "../src/artifacts/MeteredFPC.js";
import {
  MeteredFeePaymentMethod,
  MeteredExactFeePaymentMethod,
  MeteredMintAndPayFeePaymentMethod,
  MeteredMintThenPayFeePaymentMethod,
} from "../src/ts/fee-payment-methods/index.js";
import {
  fundL2AddressWithFeeJuiceFromL1,
  warpL1Time,
} from "../src/ts/test/harness.js";
import {
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
} from "../src/ts/utils/gas.js";
import { deployMeteredFPCContract } from "../src/ts/utils/deploy.js";

const { NODE_URL } = z
  .object({ NODE_URL: z.string().url().default("http://localhost:8080") })
  .parse(process.env);
const node: AztecNode = createAztecNodeClient(NODE_URL);
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
  const innerHash = await computeInnerAuthWitHash([new Fr(amount), secret]);
  const intent = { consumer: fpcAddress, innerHash };
  return wallet.createAuthWit(ownerAddress, intent);
}

// Extend the BenchmarkContext from the new package
interface MeteredBenchmarkContext extends BenchmarkContext {
  cleanup: () => Promise<void>;
  wallet: EmbeddedWallet;
  deployer: AztecAddress;
  accounts: AztecAddress[];
  counterContract: CounterContract;
  meteredFpc: MeteredFPCContract;
  // Existing payment methods (require pre-minted balance)
  meteredPaymentMethod: MeteredFeePaymentMethod;
  meteredExactPaymentMethod: MeteredExactFeePaymentMethod;
  // Payment methods with account contract authwit verification
  mintAndPayFeeMethod: MeteredMintAndPayFeePaymentMethod;
  mintThenPayFeeMethod: MeteredMintThenPayFeePaymentMethod;
  // Standalone mint benchmark data
  mintBenchmarkSecret: Fr;
  mintBenchmarkAmount: bigint;
  mintBenchmarkAuthWit: AuthWitness;
  // Gas settings (reasonable limits, consistent across all profiler steps)
  gasSettings: FeeGasSettings;
}

// Use export default class extending Benchmark
export default class CounterContractBenchmark extends Benchmark {
  /**
   * Sets up the benchmark environment for the CounterContract.
   * Creates PXE client, gets accounts, and deploys the contract.
   */
  async setup(): Promise<MeteredBenchmarkContext> {
    await Barretenberg.destroySingleton();

    const wallet = await EmbeddedWallet.create(node, {
      ephemeral: true,
      pxeConfig: {
        ...pxeConfig,
        proverEnabled: false,
      },
    });
    const accounts = await registerInitialLocalNetworkAccountsInWallet(wallet);
    const [deployer] = accounts;

    const cleanup = async () => {
      await wallet.stop();
    };

    const counterContract = await CounterContract.deploy(wallet).send({
      from: deployer,
    });

    // Deploy and fund Metered FPC (deployer is the owner who authorizes mints)
    const meteredFpc = await deployMeteredFPCContract(wallet, deployer);

    // The contract stores owner as DelayedPublicMutable (CONFIG_DELAY = 600s).
    // Private reads return zero until the delay elapses and add an
    // expiration_timestamp constraint to the tx. Warp L1 time past the delay
    // so the owner settles before any mint/authwit calls.
    await warpL1Time(node, 600);

    await fundL2AddressWithFeeJuiceFromL1(node, wallet, meteredFpc.address, {
      claimTxSender: deployer,
      produceL2Block: async () => {
        await counterContract.methods.increment().send({ from: deployer });
      },
      loggerName: "benchmark:metered",
    });

    // All profiler steps use REASONABLE limits (see FeeWrappedInteraction.simulate).
    const baseFees = await node.getCurrentMinFees();
    const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);

    const gasSettings = {
      gasLimits: REASONABLE_GAS_LIMITS,
      teardownGasLimits: REASONABLE_TEARDOWN_GAS_LIMITS,
      maxFeesPerGas,
    };

    const maxGasCost = maxGasCostFor(
      maxFeesPerGas,
      REASONABLE_GAS_LIMITS,
      REASONABLE_TEARDOWN_GAS_LIMITS,
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
        .send({ from: deployer });
    }

    // Prepare authwit for the standalone mint benchmark.
    // Must run after the ten small notes are minted so the benchmark
    // captures mint in isolation (not polluting the ten-note recursion test).
    const mintBenchmarkAmount = maxGasCost * 2n;
    const mintBenchmarkSecret = Fr.random();
    const mintBenchmarkAuthWit = await createAuthWitness(
      wallet,
      deployer,
      mintBenchmarkSecret,
      mintBenchmarkAmount,
      meteredFpc.address,
    );

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
      mintBenchmarkSecret,
      mintBenchmarkAmount,
      mintBenchmarkAuthWit,
      gasSettings,
    };
  }

  /**
   * Returns the list of CounterContract methods to be benchmarked.
   */
  getMethods(context: MeteredBenchmarkContext): NamedBenchmarkedInteraction[] {
    const {
      counterContract,
      wallet,
      deployer,
      meteredPaymentMethod,
      meteredExactPaymentMethod,
      mintAndPayFeeMethod,
      mintThenPayFeeMethod,
      mintBenchmarkSecret,
      mintBenchmarkAmount,
      mintBenchmarkAuthWit,
      meteredFpc,
      gasSettings,
    } = context;

    const increment = () =>
      counterContract.withWallet(wallet).methods.increment();

    // Methods are ordered so that note state flows correctly:
    //   1. increment                            – baseline, no notes consumed
    //   2. increment_metered_ten_notes          – runs when ONLY small notes exist → recursion
    //   3. mint_metered                         – standalone mint (authwit-gated, no fee sponsorship)
    //   4. increment_metered_mint_and_pay_fee   – self-contained; large change note funds later tests
    //   5. increment_metered_mint_then_pay_fee  – mints + pay_fee from balance
    //   6. increment_metered                    – pay_fee from balance (big change note)
    //   7. increment_metered_exact              – pay_fee_exact with teardown refund (last)
    return [
      // Baseline: no custom fee payment
      namedMethod("increment", deployer, increment()),
      // Many small notes: forces recursion in _subtract_balance because
      // only small notes exist at this point and the initial 2-note batch
      // can't cover maxGasCost
      namedMethod("increment_metered_ten_notes", deployer, increment(), {
        paymentMethod: meteredPaymentMethod,
        gasSettings,
      }),
      // Standalone mint: benchmarks the authwit-gated mint in isolation.
      // No FPC fee sponsorship — deployer pays with native FeeJuice.
      // Placed after the ten-note test so the newly minted note does not
      // affect that recursion measurement.
      namedMethod(
        "mint_metered",
        deployer,
        meteredFpc
          .withWallet(wallet)
          .methods.mint(deployer, mintBenchmarkAmount, mintBenchmarkSecret)
          .with({ authWitnesses: [mintBenchmarkAuthWit] }),
      ),
      // MintAndPayFee: mints a large amount, change note (amount - maxGasCost)
      // provides balance for increment_metered and increment_metered_exact below
      namedMethod("increment_metered_mint_and_pay_fee", deployer, increment(), {
        paymentMethod: mintAndPayFeeMethod,
        gasSettings,
      }),
      // MintThenPayFee: two-step flow - mint creates note, pay_fee consumes it
      namedMethod(
        "increment_metered_mint_then_pay_fee",
        deployer,
        increment(),
        { paymentMethod: mintThenPayFeeMethod, gasSettings },
      ),
      // Metered: uses balance from mint_and_pay_fee change note (no teardown)
      namedMethod("increment_metered", deployer, increment(), {
        paymentMethod: meteredPaymentMethod,
        gasSettings,
      }),
      // Metered Exact: uses balance with teardown refund (last, since refund
      // creates a partial note that doesn't affect earlier tests)
      namedMethod("increment_metered_exact", deployer, increment(), {
        paymentMethod: meteredExactPaymentMethod,
        gasSettings,
      }),
    ];
  }

  async teardown(context: BenchmarkContext): Promise<void> {
    await (context as MeteredBenchmarkContext).cleanup();
  }
}
