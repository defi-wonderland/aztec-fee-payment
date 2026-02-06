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

/**
 * CONFIG_DELAY for DelayedPublicMutable in the Metered contract.
 * Must match `global CONFIG_DELAY` in main.nr.
 */
export const METERED_CONFIG_DELAY = 30;

/**
 * Maximum time step for each warp iteration (in seconds).
 * Must be small enough that the PXE's anchor block remains valid for
 * transaction creation (well under MAX_INCLUDE_BY_TIMESTAMP_DURATION of 86400s).
 * Using 10 seconds to be very conservative.
 */
const MAX_TIME_STEP = 10;

/**
 * Advances L1 and L2 time by the specified number of seconds.
 * This is necessary for DelayedPublicMutable values to become available after scheduling.
 *
 * Uses EthCheatCodes from @aztec/ethereum/test with incremental time warping:
 * advances time in small steps (MAX_TIME_STEP seconds), producing an L2 block
 * after each step. This keeps the PXE's anchor block synchronized and avoids
 * "Invalid expiration timestamp" errors.
 *
 * NOTE: The official `CheatCodes.warpL2TimeAtLeastBy()` from @aztec/aztec/testing
 * requires direct access to a SequencerClient to set `minTxsPerBlock: 0` for empty
 * block production. Since we connect to a remote sandbox via RPC, we use this
 * incremental approach instead.
 *
 * @param seconds - The total number of seconds to advance time
 * @param produceL2Block - Function that produces an L2 block (e.g., by deploying a contract)
 * @param l1RpcUrl - The L1 RPC URL (default: http://127.0.0.1:8545)
 */
export async function advanceTime(
  seconds: number,
  produceL2Block: () => Promise<void>,
  l1RpcUrl: string = "http://127.0.0.1:8545",
): Promise<void> {
  const ethCheatCodes = new EthCheatCodes([l1RpcUrl], new DateProvider());

  let remaining = seconds;
  while (remaining > 0) {
    const step = Math.min(remaining, MAX_TIME_STEP);
    const currentTimestamp = await ethCheatCodes.timestamp();

    // Warp L1 time by a small step
    await ethCheatCodes.warp(currentTimestamp + step);

    // Produce an L2 block to sync the PXE with the new L1 timestamp.
    // This updates the PXE's anchor block for the next iteration.
    await produceL2Block();

    remaining -= step;
  }
}
