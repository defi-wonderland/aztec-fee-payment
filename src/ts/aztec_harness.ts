import {
  type AztecNode,
  createAztecNodeClient,
  waitForNode,
} from "@aztec/aztec.js/node";
import type { Wallet } from "@aztec/aztec.js/wallet";
import {
  registerInitialLocalNetworkAccountsInWallet,
  TestWallet,
} from "@aztec/test-wallet/server";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { Gas, GasFees } from "@aztec/stdlib/gas";
import {
  DEFAULT_DA_GAS_LIMIT,
  DEFAULT_L2_GAS_LIMIT,
  DEFAULT_TEARDOWN_DA_GAS_LIMIT,
  DEFAULT_TEARDOWN_L2_GAS_LIMIT,
} from "@aztec/constants";

import { deployFeePaymentContract } from "./utils.js";
import { fundL2AddressWithFeeJuiceFromL1 } from "./fee_juice_funding.js";
import type { FeePaymentContract } from "../artifacts/FeePayment.js";

export const LOCAL_AZTEC_NODE_URL = "http://localhost:8080";

export const REASONABLE_GAS_LIMITS = Gas.from({
  daGas: DEFAULT_DA_GAS_LIMIT,
  l2Gas: DEFAULT_L2_GAS_LIMIT,
});

export const REASONABLE_TEARDOWN_GAS_LIMITS = Gas.from({
  daGas: DEFAULT_TEARDOWN_DA_GAS_LIMIT,
  l2Gas: DEFAULT_TEARDOWN_L2_GAS_LIMIT,
});

export function maxFeesPerGasFromBaseFees(
  baseFees: {
    feePerDaGas: string | number | bigint;
    feePerL2Gas: string | number | bigint;
  },
  multiplier: bigint = 3n,
): GasFees {
  return new GasFees(
    BigInt(baseFees.feePerDaGas) * multiplier,
    BigInt(baseFees.feePerL2Gas) * multiplier,
  );
}

export function maxGasCostFor(
  maxFeesPerGas: GasFees,
  gasLimits: Gas,
  teardownGasLimits: Gas,
): bigint {
  return (
    BigInt(maxFeesPerGas.feePerDaGas) *
      (BigInt(gasLimits.daGas) + BigInt(teardownGasLimits.daGas)) +
    BigInt(maxFeesPerGas.feePerL2Gas) *
      (BigInt(gasLimits.l2Gas) + BigInt(teardownGasLimits.l2Gas))
  );
}

export type LocalNetworkContext = {
  aztecNode: AztecNode;
  wallet: TestWallet;
  accounts: AztecAddress[];
  deployer: AztecAddress;
};

export async function createLocalNetworkContext(opts?: {
  nodeUrl?: string;
  wallet?: { dataDirectory?: string; proverEnabled?: boolean };
  /** Defaults to true for more reliable local runs. */
  waitForNode?: boolean;
}): Promise<LocalNetworkContext> {
  const nodeUrl = opts?.nodeUrl ?? LOCAL_AZTEC_NODE_URL;
  const aztecNode = createAztecNodeClient(nodeUrl, {});
  if (opts?.waitForNode ?? true) {
    await waitForNode(aztecNode);
  }

  const wallet = await TestWallet.create(
    aztecNode,
    {
      dataDirectory: opts?.wallet?.dataDirectory ?? "pxe-test",
      proverEnabled: opts?.wallet?.proverEnabled ?? false,
    },
    {},
  );

  const accounts = await registerInitialLocalNetworkAccountsInWallet(wallet);
  const [deployer] = accounts;
  if (!deployer)
    throw new Error(
      "No local-network accounts returned by wallet registration.",
    );

  return { aztecNode, wallet, accounts, deployer };
}

export async function deployAndFundFeePayer(args: {
  aztecNode: Pick<AztecNode, "getL1ToL2MessageBlock" | "getBlockNumber">;
  wallet: Wallet;
  claimTxSender: AztecAddress;
  produceL2Block: () => Promise<void>;
  loggerName?: string;
}): Promise<{
  feePaymentContract: FeePaymentContract;
  feeJuiceBalance: bigint;
  messageBlock: number;
}> {
  const feePaymentContract = await deployFeePaymentContract(args.wallet);
  const { balance, messageBlock } = await fundL2AddressWithFeeJuiceFromL1(
    args.aztecNode,
    args.wallet,
    feePaymentContract.address,
    {
      claimTxSender: args.claimTxSender,
      produceL2Block: args.produceL2Block,
      loggerName: args.loggerName,
    },
  );
  return { feePaymentContract, feeJuiceBalance: balance, messageBlock };
}
