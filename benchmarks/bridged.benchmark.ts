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
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import type { FeePaymentMethod } from "@aztec/aztec.js/fee";

import { CounterContract } from "../src/artifacts/Counter.js";
import { BridgedFPCContract } from "../src/artifacts/BridgedFPC.js";
import {
  MeteredFeePaymentMethod,
  BridgedMintAndPayFeePaymentMethod,
} from "../src/ts/fee-payment-methods/index.js";
import {
  fundL2AddressWithFeeJuiceFromL1,
  bridgeForMintBridged,
} from "../src/ts/test/harness.js";
import { deployCounter } from "../src/ts/test/utils.js";
import { registerBridgedContract } from "../src/ts/utils/deploy.js";
import {
  maxFeesPerGasFromBaseFees,
  maxGasCostFor,
  REASONABLE_GAS_LIMITS,
  REASONABLE_TEARDOWN_GAS_LIMITS,
} from "../src/ts/utils/gas.js";

const { NODE_URL = "http://localhost:8080" } = process.env;
const node: AztecNode = createAztecNodeClient(NODE_URL);
await waitForNode(node);
const pxeConfig = getPXEConfig();

/**
 * Wraps a ContractFunctionInteraction so the benchmark profiler always uses
 * a per-interaction FeePaymentMethod and gas settings.
 * (Same pattern as metered.benchmark.ts — see that file for full rationale.)
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
    return paymentMethod
      ? this.inner.request({
          ...options,
          fee: { ...(options.fee ?? {}), paymentMethod },
        })
      : this.inner.request(options);
  }

  async simulate(options: any = {}) {
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
    };
    return this.inner.simulate(this.withFee(adjusted));
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

interface BridgedBenchmarkContext extends BenchmarkContext {
  cleanup: () => Promise<void>;
  wallet: EmbeddedWallet;
  deployer: AztecAddress;
  counterContract: CounterContract;
  bridgedFpc: BridgedFPCContract;
  bridgedPaymentMethod: MeteredFeePaymentMethod;
  mintAndPayFeeMethod: BridgedMintAndPayFeePaymentMethod;
  // Pre-bridged deposit kept for the mint_and_pay_fee benchmark method.
  // The L1 deposit is done in setup; FeeJuice.claim + mint_bridged_and_pay_fee
  // happen atomically inside the benchmark interaction itself.
  mintAndPayFeeDeposit: {
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
   * L1→L2 bridge + FeeJuice.claim + mint_bridged cycle so the deployer
   * has internal wFJ balance ready for the pay_fee benchmark methods.
   */
  async setup(): Promise<BridgedBenchmarkContext> {
    await Barretenberg.destroySingleton();

    const dataDirectory = join(
      tmpdir(),
      `aztec-bridged-${randomBytes(8).toString("hex")}`,
    );
    const wallet = await EmbeddedWallet.create(node, {
      pxeConfig: {
        ...pxeConfig,
        dataDirectory,
        proverEnabled: false,
      },
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

    // Register BridgedFPC — fully private, no on-chain deployment tx required.
    const bridgedFpc = await registerBridgedContract(wallet);

    // Fund the FPC's public FeeJuice balance so it can pay sequencers.
    await fundL2AddressWithFeeJuiceFromL1(node, wallet, bridgedFpc.address, {
      claimTxSender: deployer,
      produceL2Block: async () => {
        await deployCounter(wallet);
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

    const maxGasCost = maxGasCostFor(
      maxFeesPerGas,
      REASONABLE_GAS_LIMITS,
      REASONABLE_TEARDOWN_GAS_LIMITS,
    );

    // Bridge 1: fund internal wFJ balance for the pay_fee benchmark methods.
    // FeeJuice.claim + mint_bridged happen here so the balance is ready at benchmark time.
    const saltForBalance = Fr.random();
    const {
      secret: secretForBalance,
      claimAmount,
      leafIndex: leafIndexForBalance,
    } = await bridgeForMintBridged(
      node,
      bridgedFpc.address,
      AztecAddress.fromString(deployer.toString()),
      saltForBalance,
      async () => {
        await deployCounter(wallet);
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
      .mint_bridged(claimAmount, saltForBalance, leafIndexForBalance)
      .send({ from: deployer });

    // Bridge 2: reserved for the mint_and_pay_fee benchmark method.
    // Only the L1 deposit is done here; FeeJuice.claim + mint_bridged_and_pay_fee
    // execute atomically inside the benchmark interaction itself.
    const saltForMintAndPay = Fr.random();
    const {
      secret: secretForMintAndPay,
      claimAmount: claimAmountForMintAndPay,
      leafIndex: leafIndexForMintAndPay,
    } = await bridgeForMintBridged(
      node,
      bridgedFpc.address,
      AztecAddress.fromString(deployer.toString()),
      saltForMintAndPay,
      async () => {
        await deployCounter(wallet);
      },
      { loggerName: "benchmark:bridged-bridge-mint-and-pay" },
    );

    const bridgedPaymentMethod = new MeteredFeePaymentMethod(
      bridgedFpc.address,
    );

    const mintAndPayFeeMethod = new BridgedMintAndPayFeePaymentMethod(
      bridgedFpc.address,
      claimAmountForMintAndPay,
      secretForMintAndPay,
      saltForMintAndPay,
      leafIndexForMintAndPay,
    );

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
      gasSettings,
    };
  }

  getMethods(context: BridgedBenchmarkContext): any[] {
    const {
      counterContract,
      wallet,
      deployer,
      bridgedPaymentMethod,
      mintAndPayFeeMethod,
      gasSettings,
    } = context;

    // Methods ordered so note state flows correctly:
    //   1. increment                          -- baseline, no FPC
    //   2. increment_bridged_mint_and_pay_fee -- FeeJuice.claim + mint_bridged_and_pay_fee
    //                                           in one tx (cold-start, no prior balance)
    //   3. increment_bridged                  -- pay_fee from existing wFJ balance
    //                                           (funded by mint_bridged in setup)
    return [
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
        name: "increment_bridged_mint_and_pay_fee",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            mintAndPayFeeMethod,
            gasSettings,
          ),
        },
      },
      {
        name: "increment_bridged",
        interaction: {
          caller: deployer,
          action: new FeeWrappedInteraction(
            counterContract.withWallet(wallet).methods.increment(),
            bridgedPaymentMethod,
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
