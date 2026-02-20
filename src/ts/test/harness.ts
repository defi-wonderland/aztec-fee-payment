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
import { EthCheatCodes } from "@aztec/ethereum/test";
import { DateProvider } from "@aztec/foundation/timer";
import { rmSync } from "node:fs";

export const LOCAL_AZTEC_NODE_URL = "http://localhost:8080";
const DEFAULT_L1_RPC_URL = "http://127.0.0.1:8545";

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

  const dataDirectory = opts?.wallet?.dataDirectory ?? "pxe-test";
  rmSync(dataDirectory, { recursive: true, force: true });

  const wallet = await TestWallet.create(
    aztecNode,
    {
      dataDirectory,
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
    .send({ from: opts.claimTxSender });

  const { getFeeJuiceBalance } = await import("@aztec/aztec.js/utils");
  const balance = await getFeeJuiceBalance(recipient, aztecNode as any);
  return { balance, messageBlock };
}

/**
 * Advance L1 time. After warping, the next L2 block picks up the new L1 timestamp.
 *
 * We don't use EthCheatCodes.warp() because it mines with `hardhat_mine`,
 * which does not reliably honor a pending evm_setNextBlockTimestamp on
 * Anvil. Instead we compose the individual EthCheatCodes helpers ourselves:
 * pause interval mining → set timestamp → evm_mine → restore interval mining.
 * Pausing interval mining prevents a race where an auto-mined block fires
 * between setNextBlockTimestamp and evmMine, consuming the pending timestamp
 * and causing the PXE to detect a reorg.
 *
 * @param seconds - How many seconds to advance (must be >= the contract's CONFIG_DELAY)
 * @param l1RpcUrl - Anvil RPC endpoint (defaults to local 8545)
 */
export async function warpL1Time(
  seconds: number,
  l1RpcUrl: string = DEFAULT_L1_RPC_URL,
): Promise<void> {
  const cc = new EthCheatCodes([l1RpcUrl], new DateProvider());
  const blockInterval = await cc.getIntervalMining();
  try {
    if (blockInterval !== null) {
      await cc.setIntervalMining(0);
    }
    const before = await cc.timestamp();
    await cc.setNextBlockTimestamp(before + seconds);
    await cc.evmMine();
  } finally {
    if (blockInterval !== null && blockInterval > 0) {
      await cc.setIntervalMining(blockInterval);
    }
  }
}
