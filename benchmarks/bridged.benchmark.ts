import {
  type BenchmarkContext,
  Benchmark,
} from "@defi-wonderland/aztec-benchmark";
import { Gas, GasFees } from "@aztec/stdlib/gas";
import { Fr } from "@aztec/aztec.js/fields";
import {
  createAztecNodeClient,
  waitForNode,
  type AztecNode,
} from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { registerInitialLocalNetworkAccountsInWallet } from "@aztec/wallets/testing";
import { getPXEConfig } from "@aztec/pxe/config";
import { Barretenberg } from "@aztec/bb.js";
import { FeeJuiceContract } from "@aztec/noir-contracts.js/FeeJuice";
import { ProtocolContractAddress } from "@aztec/protocol-contracts";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import {
  ContractFunctionInteraction,
  type RequestInteractionOptions,
  type SimulateInteractionOptions,
  type ProfileInteractionOptions,
  type SendInteractionOptions,
} from "@aztec/aztec.js/contracts";
import type { ContractFunctionInteractionCallIntent } from "@aztec/aztec.js/authorization";
import { z } from "zod";

import { CounterContract } from "../src/artifacts/Counter.js";
import { BridgedFPCContract } from "../src/artifacts/BridgedFPC.js";
import {
  FPCFeePaymentMethod,
  BridgedMintAndPayFeePaymentMethod,
} from "../src/ts/fee-payment-methods/index.js";
import {
  fundL2AddressWithFeeJuiceFromL1,
  bridgeForMint,
} from "../src/ts/test/harness.js";
import { registerBridgedContract } from "../src/ts/utils/deploy.js";
import {
  maxFeesPerGasFromBaseFees,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
} from "../src/ts/utils/gas.js";

const { NODE_URL } = z
  .object({ NODE_URL: z.string().url().default("http://localhost:8080") })
  .parse(process.env);
const node: AztecNode = createAztecNodeClient(NODE_URL);
await waitForNode(node);
const pxeConfig = getPXEConfig();

type NamedBenchmarkedInteraction = {
  name: string;
  interaction: ContractFunctionInteractionCallIntent;
};

/**
 * Wraps a ContractFunctionInteraction so the benchmark profiler always uses
 * a per-interaction FeePaymentMethod and gas settings.
 * (Same pattern as metered.benchmark.ts — see that file for full rationale.)
 */
class FeeWrappedInteraction {
  constructor(
    private readonly inner: ContractFunctionInteraction,
    private readonly paymentMethod?: FeePaymentMethod,
    private readonly gasSettings?: {
      gasLimits: Gas;
      teardownGasLimits: Gas;
      maxFeesPerGas: GasFees;
    },
  ) {}

  async request(options: RequestInteractionOptions = {}) {
    const paymentMethod = options?.fee?.paymentMethod ?? this.paymentMethod;
    return paymentMethod
      ? this.inner.request({
          ...options,
          fee: { ...(options.fee ?? {}), paymentMethod },
        })
      : this.inner.request(options);
  }

  async simulate(options: SimulateInteractionOptions) {
    // Strip estimateGas to avoid wallet inflating gas limits — same reasoning
    // as in metered.benchmark.ts (see UPGRADE CHECK comment there).
    const { estimateGas, estimatedGasPadding, ...restFee } = options.fee ?? {};
    const adjusted = {
      ...options,
      includeMetadata: estimateGas || options.includeMetadata,
      fee: {
        ...restFee,
        ...(estimatedGasPadding !== undefined && { estimatedGasPadding }),
      },
    } as SimulateInteractionOptions;
    return this.inner.simulate(this.withFee(adjusted));
  }

  async profile(options: ProfileInteractionOptions) {
    return this.inner.profile(this.withFee(options));
  }

  async send(options: SendInteractionOptions) {
    return this.inner.send(this.withFee(options));
  }

  private withFee<
    T extends
      | SimulateInteractionOptions
      | ProfileInteractionOptions
      | SendInteractionOptions,
  >(options: T): T {
    const paymentMethod = options?.fee?.paymentMethod ?? this.paymentMethod;
    if (!paymentMethod) return options;
    return {
      ...options,
      fee: {
        ...(options.fee ?? {}),
        paymentMethod,
        ...(this.gasSettings && { gasSettings: this.gasSettings }),
      },
    } as T;
  }
}

interface BridgedBenchmarkContext extends BenchmarkContext {
  cleanup: () => Promise<void>;
  wallet: EmbeddedWallet;
  deployer: AztecAddress;
  counterContract: CounterContract;
  bridgedFpc: BridgedFPCContract;
  bridgedPaymentMethod: FPCFeePaymentMethod;
  mintAndPayFeeMethod: BridgedMintAndPayFeePaymentMethod;
  // Pre-bridged deposit kept for the mint_and_pay_fee benchmark method.
  // The L1 deposit is done in setup; FeeJuice.claim + mint_and_pay_fee
  // happen atomically inside the benchmark interaction itself.
  mintAndPayFeeDeposit: {
    secret: Fr;
    salt: Fr;
    leafIndex: Fr;
    amount: bigint;
  };
  // Pre-bridged deposit for the standalone mint benchmark.
  // FeeJuice.claim is settled in setup; only mint runs in the benchmark.
  mintBridgedDeposit: {
    secret: Fr;
    salt: Fr;
    leafIndex: Fr;
    amount: bigint;
  };
  gasSettings: {
    gasLimits: Gas;
    teardownGasLimits: Gas;
    maxFeesPerGas: GasFees;
  };
}

export default class BridgedFPCBenchmark extends Benchmark {
  /**
   * Sets up the benchmark environment for the BridgedFPC contract.
   *
   * Registers the fully-private BridgedFPC (no deployment tx), funds its
   * public FeeJuice balance for sequencer payments, then performs a full
   * L1→L2 bridge + FeeJuice.claim + mint cycle so the deployer
   * has internal wFJ balance ready for the pay_fee benchmark methods.
   */
  async setup(): Promise<BridgedBenchmarkContext> {
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

    // Register BridgedFPC — fully private, no on-chain deployment tx required.
    const bridgedFpc = await registerBridgedContract(wallet);

    // Fund the FPC's public FeeJuice balance so it can pay sequencers.
    await fundL2AddressWithFeeJuiceFromL1(node, wallet, bridgedFpc.address, {
      claimTxSender: deployer,
      produceL2Block: async () => {
        await counterContract.methods.increment().send({ from: deployer });
      },
      loggerName: "benchmark:bridged-fund",
    });

    const baseFees = await node.getCurrentMinFees();
    const maxFeesPerGas = maxFeesPerGasFromBaseFees(baseFees);

    const gasSettings = {
      gasLimits: REASONABLE_GAS_LIMITS,
      teardownGasLimits: REASONABLE_TEARDOWN_GAS_LIMITS,
      maxFeesPerGas,
    };

    // Bridge 1: fund internal wFJ balance for the pay_fee benchmark methods.
    // FeeJuice.claim + mint happen here so the balance is ready at benchmark time.
    const saltForBalance = Fr.random();
    const {
      secret: secretForBalance,
      claimAmount,
      leafIndex: leafIndexForBalance,
    } = await bridgeForMint(
      node,
      bridgedFpc.address,
      AztecAddress.fromString(deployer.toString()),
      saltForBalance,
      async () => {
        await counterContract.methods.increment().send({ from: deployer });
      },
      { loggerName: "benchmark:bridged-bridge-balance" },
    );

    const feeJuice = FeeJuiceContract.at(
      ProtocolContractAddress.FeeJuice,
      wallet,
    );
    await feeJuice.methods
      .claim(
        bridgedFpc.address,
        claimAmount,
        secretForBalance,
        leafIndexForBalance,
      )
      .send({ from: deployer });

    await bridgedFpc.methods
      .mint(claimAmount, saltForBalance, leafIndexForBalance)
      .send({ from: deployer });

    // Bridge 2: reserved for the mint_and_pay_fee benchmark method.
    // Only the L1 deposit is done here; FeeJuice.claim + mint_and_pay_fee
    // execute atomically inside the benchmark interaction itself.
    const saltForMintAndPay = Fr.random();
    const {
      secret: secretForMintAndPay,
      claimAmount: claimAmountForMintAndPay,
      leafIndex: leafIndexForMintAndPay,
    } = await bridgeForMint(
      node,
      bridgedFpc.address,
      AztecAddress.fromString(deployer.toString()),
      saltForMintAndPay,
      async () => {
        await counterContract.methods.increment().send({ from: deployer });
      },
      { loggerName: "benchmark:bridged-bridge-mint-and-pay" },
    );

    const bridgedPaymentMethod = new FPCFeePaymentMethod(bridgedFpc.address);

    const mintAndPayFeeMethod = new BridgedMintAndPayFeePaymentMethod(
      bridgedFpc.address,
      claimAmountForMintAndPay,
      secretForMintAndPay,
      saltForMintAndPay,
      leafIndexForMintAndPay,
    );

    // Bridge 3: for the standalone mint benchmark.
    // FeeJuice.claim is settled here so the nullifier exists on-chain before
    // the benchmark runs. Only mint itself is exercised in the benchmark.
    const saltForMintBridged = Fr.random();
    const {
      secret: secretForMintBridged,
      claimAmount: claimAmountForMintBridged,
      leafIndex: leafIndexForMintBridged,
    } = await bridgeForMint(
      node,
      bridgedFpc.address,
      AztecAddress.fromString(deployer.toString()),
      saltForMintBridged,
      async () => {
        await counterContract.methods.increment().send({ from: deployer });
      },
      { loggerName: "benchmark:bridged-bridge-mint-bridged" },
    );

    await feeJuice.methods
      .claim(
        bridgedFpc.address,
        claimAmountForMintBridged,
        secretForMintBridged,
        leafIndexForMintBridged,
      )
      .send({ from: deployer });

    return {
      cleanup,
      wallet,
      deployer,
      counterContract,
      bridgedFpc,
      bridgedPaymentMethod,
      mintAndPayFeeMethod,
      mintAndPayFeeDeposit: {
        secret: secretForMintAndPay,
        salt: saltForMintAndPay,
        leafIndex: leafIndexForMintAndPay,
        amount: claimAmountForMintAndPay,
      },
      mintBridgedDeposit: {
        secret: secretForMintBridged,
        salt: saltForMintBridged,
        leafIndex: leafIndexForMintBridged,
        amount: claimAmountForMintBridged,
      },
      gasSettings,
    };
  }

  getMethods(
    context: BridgedBenchmarkContext,
  ): Array<
    ContractFunctionInteractionCallIntent | NamedBenchmarkedInteraction
  > {
    const {
      counterContract,
      wallet,
      deployer,
      bridgedFpc,
      bridgedPaymentMethod,
      mintAndPayFeeMethod,
      mintBridgedDeposit,
      gasSettings,
    } = context;

    const wrap = (
      inner: ContractFunctionInteraction,
      paymentMethod?: FeePaymentMethod,
      gasSettings?: BridgedBenchmarkContext["gasSettings"],
    ) =>
      // Safe: the framework only calls request/simulate/profile/send, all implemented above.
      new FeeWrappedInteraction(
        inner,
        paymentMethod,
        gasSettings,
      ) as unknown as ContractFunctionInteraction;

    // Methods ordered so note state flows correctly:
    //   1. increment                          -- baseline, no FPC
    //   2. mint_bridged                       -- standalone mint (bridge-claim proof; nullifier pre-settled
    //                                           in setup, no fee sponsorship)
    //   3. increment_bridged                  -- pay_fee from existing wFJ balance
    //                                           (funded by mint in setup)
    //   4. increment_bridged_mint_and_pay_fee -- FeeJuice.claim + mint_and_pay_fee
    //                                           in one tx (cold-start, no prior balance)
    return [
      {
        name: "increment",
        interaction: {
          caller: deployer,
          action: wrap(counterContract.withWallet(wallet).methods.increment()),
        },
      },
      // Standalone mint: benchmarks the bridge-claim proof in isolation.
      // FeeJuice.claim was settled in setup, so assert_nullifier_exists sees a
      // settled nullifier. No FPC fee sponsorship — deployer pays native FeeJuice.
      {
        name: "mint_bridged",
        interaction: {
          caller: deployer,
          action: wrap(
            bridgedFpc
              .withWallet(wallet)
              .methods.mint(
                mintBridgedDeposit.amount,
                mintBridgedDeposit.salt,
                mintBridgedDeposit.leafIndex,
              ),
          ),
        },
      },
      {
        name: "increment_bridged",
        interaction: {
          caller: deployer,
          action: wrap(
            counterContract.withWallet(wallet).methods.increment(),
            bridgedPaymentMethod,
            gasSettings,
          ),
        },
      },
      {
        name: "increment_bridged_mint_and_pay_fee",
        interaction: {
          caller: deployer,
          action: wrap(
            counterContract.withWallet(wallet).methods.increment(),
            mintAndPayFeeMethod,
            gasSettings,
          ),
        },
      },
    ];
  }

  async teardown(context: BenchmarkContext): Promise<void> {
    await (context as BridgedBenchmarkContext).cleanup();
  }
}
