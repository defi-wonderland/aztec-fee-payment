import type { Wallet } from "@aztec/aztec.js/wallet";
import type { AztecNode } from "@aztec/aztec.js/node";
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
import { getFeeJuiceBalance } from "@aztec/aztec.js/utils";
import { FeeJuiceContract } from "@aztec/noir-contracts.js/FeeJuice";
import { ProtocolContractAddress } from "@aztec/protocol-contracts";
import { Fr } from "@aztec/foundation/curves/bn254";
import { createLogger } from "@aztec/foundation/log";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import type { AztecAddress } from "@aztec/stdlib/aztec-address";

export type FundFeeJuiceFromL1Options = {
  /**
   * L1 RPC urls (anvil/hardhat) used by local-network.
   * Defaults to local anvil in Aztec local-network.
   */
  l1RpcUrls?: string[];
  /**
   * L1 mnemonic used by local-network.
   * Defaults to the local-network mnemonic.
   */
  l1Mnemonic?: string;
  /** Logger name prefix. */
  loggerName?: string;
  /**
   * An Aztec address that will send the L2 `claim(...)` tx.
   * Must be registered in the wallet.
   */
  claimTxSender: AztecAddress;
  /**
   * Callback used to produce (advance) L2 blocks until the L1->L2 message is included.
   * This should send some cheap tx using a funded account.
   */
  produceL2Block: () => Promise<void>;
  /**
   * How many times to poll for message ingestion on L2.
   * (We keep this tight/short in local-network; this is not "seconds-based waiting".)
   */
  messagePollTries?: number;
  /** Delay between polls. */
  messagePollIntervalMs?: number;
};

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

  const balance = await getFeeJuiceBalance(recipient, aztecNode as any);
  return { balance, messageBlock };
}
