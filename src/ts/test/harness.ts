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
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
import { FeeJuiceContract } from "@aztec/noir-contracts.js/FeeJuice";
import { ProtocolContractAddress } from "@aztec/protocol-contracts";
import { Fr } from "@aztec/foundation/curves/bn254";
import { createLogger } from "@aztec/foundation/log";
import { createExtendedL1Client } from "@aztec/ethereum/client";

export const LOCAL_AZTEC_NODE_URL = "http://localhost:8080";

export type LocalNetworkContext = {
  aztecNode: AztecNode;
  wallet: TestWallet;
  accounts: AztecAddress[];
  deployer: AztecAddress;
};

export async function createLocalNetworkContext(opts?: {
  nodeUrl?: string;
  wallet?: { dataDirectory?: string; proverEnabled?: boolean };
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

export type FundFeeJuiceFromL1Options = {
  l1RpcUrls?: string[];
  l1Mnemonic?: string;
  loggerName?: string;
  claimTxSender: AztecAddress;
  produceL2Block: () => Promise<void>;
  messagePollTries?: number;
  messagePollIntervalMs?: number;
};

/**
 * Fund an L2 address with FeeJuice by bridging from L1.
 * This is the standard way to fund FPCs with the native fee token.
 */
export async function fundL2AddressWithFeeJuiceFromL1(
  aztecNode: Pick<AztecNode, "getL1ToL2MessageBlock" | "getBlockNumber">,
  wallet: Wallet,
  recipient: AztecAddress,
  opts: FundFeeJuiceFromL1Options,
): Promise<{ balance: bigint; messageBlock: number }> {
  const logger = createLogger(opts.loggerName ?? "fee-juice");
  const l1Client = createExtendedL1Client(
    opts.l1RpcUrls ?? ["http://127.0.0.1:8545"],
    opts.l1Mnemonic ??
      "test test test test test test test test test test test junk",
  );

  const feeJuicePortal = await L1FeeJuicePortalManager.new(
    aztecNode as any,
    l1Client,
    logger,
  );
  const claim = await feeJuicePortal.bridgeTokensPublic(
    recipient,
    undefined,
    true,
  );

  const messageHash = Fr.fromString(claim.messageHash);
  const pollTries = opts.messagePollTries ?? 400;
  const pollIntervalMs = opts.messagePollIntervalMs ?? 10;

  let messageBlock: number | undefined;
  for (let i = 0; i < pollTries; i++) {
    messageBlock = await aztecNode.getL1ToL2MessageBlock(messageHash);
    if (messageBlock !== undefined) break;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  if (messageBlock === undefined) {
    throw new Error(
      `L1->L2 message not yet ingested by node for FeeJuice deposit: ${claim.messageHash}`,
    );
  }

  while ((await aztecNode.getBlockNumber()) < messageBlock) {
    await opts.produceL2Block();
  }

  const feeJuice = FeeJuiceContract.at(
    ProtocolContractAddress.FeeJuice,
    wallet,
  );
  await feeJuice.methods
    .claim(
      recipient,
      claim.claimAmount,
      claim.claimSecret,
      new Fr(claim.messageLeafIndex),
    )
    .send({ from: opts.claimTxSender })
    .wait();

  const { getFeeJuiceBalance } = await import("@aztec/aztec.js/utils");
  const balance = await getFeeJuiceBalance(recipient, aztecNode as any);
  return { balance, messageBlock };
}
