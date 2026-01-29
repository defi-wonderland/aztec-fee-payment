/**
 * Fund FPC Script
 *
 * Bridges Fee Juice from L1 (Sepolia) to L2 (Aztec) and claims it to an FPC.
 * Uses the L1 Fee Juice faucet for minting and Sponsored FPC for L2 claim fees.
 *
 * Usage:
 *   yarn fund-fpc -a 1000000000000000000 --network devnet
 */
import "dotenv/config";
import { Command } from "commander";
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { generateClaimSecret } from "@aztec/aztec.js/ethereum";
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { AccountWithSecretKey, Account } from "@aztec/aztec.js/account";
import { AccountManager, type Wallet } from "@aztec/aztec.js/wallet";
import { BaseWallet } from "@aztec/wallet-sdk/base-wallet";
import { createLogger } from "@aztec/foundation/log";
import { sleep } from "@aztec/foundation/sleep";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { FeeJuicePortalAbi, IERC20Abi } from "@aztec/l1-artifacts";
import { SingleKeyAccountContract } from "@aztec/accounts/single_key";
import { deriveSigningKey } from "@aztec/stdlib/keys";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { FeeJuiceContract } from "@aztec/noir-contracts.js/FeeJuice";
import { SPONSORED_FPC_SALT } from "@aztec/constants";
import { poseidon2Hash } from "@aztec/foundation/crypto/poseidon";
import { createStore } from "@aztec/kv-store/lmdb-v2";
import { createPXE, getPXEConfig } from "@aztec/pxe/server";
import type { PXE, PXECreationOptions } from "@aztec/pxe/server";
import { sepolia } from "viem/chains";
import { getContract, decodeEventLog } from "viem";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const logger = createLogger("aztec:fund-fpc");

// Fee Juice Faucet on Sepolia (permissioned minter)
const FEE_JUICE_FAUCET = "0xd1dff4c8465d4dcd0c08a401a1e03effe108f3e1" as const;

const FeeAssetHandlerAbi = [
  {
    inputs: [{ name: "_recipient", type: "address" }],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "mintAmount",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

type Network = "devnet" | "testnet";

interface NetworkConfig {
  nodeUrl: string;
  l1RpcUrl: string;
}

const NETWORKS: Record<Network, NetworkConfig> = {
  devnet: {
    nodeUrl: process.env.AZTEC_NODE_URL || "https://next.devnet.aztec-labs.com",
    l1RpcUrl: process.env.L1_RPC_URL || "https://rpc.sepolia.ethpandaops.io",
  },
  testnet: {
    nodeUrl: process.env.AZTEC_NODE_URL || "https://testnet.aztec-labs.com",
    l1RpcUrl: process.env.L1_RPC_URL || "https://rpc.sepolia.ethpandaops.io",
  },
};

interface Options {
  network: Network;
  amount: string;
  fpcAddress?: string;
  skipClaim?: boolean;
  dryRun?: boolean;
}

function loadFpcAddress(network: string): string | null {
  const dir = join(process.cwd(), `deployments/${network}`);
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith("deployment-") && f.endsWith(".json"))
      .sort()
      .reverse();
    if (!files[0]) return null;
    const data = JSON.parse(readFileSync(join(dir, files[0]), "utf-8"));
    return data.metered?.address || null;
  } catch {
    return null;
  }
}

// Minimal wallet for L2 operations
class MinimalWallet extends BaseWallet {
  private accounts = new Map<string, AccountWithSecretKey>();

  constructor(pxe: PXE, node: AztecNode) {
    super(pxe as any, node);
  }

  addAccount(account: AccountWithSecretKey) {
    this.accounts.set(account.getAddress().toString(), account);
  }

  protected async getAccountFromAddress(
    address: AztecAddress,
  ): Promise<Account> {
    const acc = this.accounts.get(address.toString());
    if (!acc) throw new Error(`Account not found: ${address}`);
    return acc;
  }

  async getAccounts() {
    return Array.from(this.accounts.values()).map((a) => ({
      alias: "",
      item: a.getAddress(),
    }));
  }
}

async function fundFpc(options: Options): Promise<void> {
  const config = NETWORKS[options.network];
  const amount = BigInt(options.amount);

  // Get FPC address
  const fpcAddressStr = options.fpcAddress || loadFpcAddress(options.network);
  if (!fpcAddressStr) {
    throw new Error(
      "FPC address not found. Use --fpc-address or deploy first.",
    );
  }
  const fpcAddress = AztecAddress.fromString(fpcAddressStr);

  logger.info(`=== Fund FPC on ${options.network} ===`);
  logger.info(`FPC: ${fpcAddress}`);
  logger.info(`Amount: ${Number(amount) / 1e18} FJ`);

  if (options.dryRun) {
    logger.info("[DRY RUN] Would bridge and claim Fee Juice");
    return;
  }

  // L1 Setup
  const l1Key = process.env.L1_PRIVATE_KEY || process.env.L1_MNEMONIC;
  if (!l1Key) {
    throw new Error("L1_PRIVATE_KEY or L1_MNEMONIC required");
  }

  const l1Client = createExtendedL1Client([config.l1RpcUrl], l1Key, sepolia);
  logger.info(`L1 Account: ${l1Client.account.address}`);

  // L2 Setup
  const node = createAztecNodeClient(config.nodeUrl, {});
  const nodeInfo = await node.getNodeInfo();
  logger.info(`L2 Node: ${nodeInfo.nodeVersion}`);

  const { feeJuiceAddress, feeJuicePortalAddress } =
    nodeInfo.l1ContractAddresses;
  if (feeJuiceAddress.isZero() || feeJuicePortalAddress.isZero()) {
    throw new Error("Fee Juice contracts not deployed on L1");
  }

  // L1 Contracts
  const feeJuice = getContract({
    address: feeJuiceAddress.toString() as `0x${string}`,
    abi: IERC20Abi,
    client: l1Client,
  });

  const portal = getContract({
    address: feeJuicePortalAddress.toString() as `0x${string}`,
    abi: FeeJuicePortalAbi,
    client: l1Client,
  });

  const faucet = getContract({
    address: FEE_JUICE_FAUCET,
    abi: FeeAssetHandlerAbi,
    client: l1Client,
  });

  // Check and mint FJ if needed
  let balance = (await feeJuice.read.balanceOf([
    l1Client.account.address,
  ])) as bigint;
  logger.info(`L1 FJ Balance: ${Number(balance) / 1e18} FJ`);

  if (balance < amount) {
    logger.info("Minting from faucet...");
    const mintAmount = (await faucet.read.mintAmount()) as bigint;
    const mintsNeeded = Math.ceil(
      Number(amount - balance) / Number(mintAmount),
    );

    for (let i = 0; i < mintsNeeded; i++) {
      const hash = await faucet.write.mint([l1Client.account.address]);
      await l1Client.waitForTransactionReceipt({ hash });
      logger.info(`Minted ${Number(mintAmount) / 1e18} FJ`);
    }

    balance = (await feeJuice.read.balanceOf([
      l1Client.account.address,
    ])) as bigint;
    logger.info(`New L1 FJ Balance: ${Number(balance) / 1e18} FJ`);
  }

  // Bridge to L2
  logger.info("Bridging to L2...");
  const [claimSecret, claimSecretHash] = await generateClaimSecret(logger);

  // Approve
  const approveHash = await feeJuice.write.approve([
    feeJuicePortalAddress.toString() as `0x${string}`,
    amount,
  ]);
  await l1Client.waitForTransactionReceipt({ hash: approveHash });

  // Deposit
  const depositArgs = [
    fpcAddress.toString() as `0x${string}`,
    amount,
    claimSecretHash.toString() as `0x${string}`,
  ] as const;

  await portal.simulate.depositToAztecPublic(depositArgs);
  const depositHash = await portal.write.depositToAztecPublic(depositArgs);
  const depositReceipt = await l1Client.waitForTransactionReceipt({
    hash: depositHash,
  });

  // Parse event for message info
  let messageHash = "";
  let messageLeafIndex = 0n;

  for (const log of depositReceipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: FeeJuicePortalAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "DepositToAztecPublic") {
        const args = decoded.args as { key: `0x${string}`; index: bigint };
        messageHash = args.key;
        messageLeafIndex = args.index;
        break;
      }
    } catch {
      // Not matching event
    }
  }

  logger.info(`Bridge tx: ${depositReceipt.transactionHash}`);
  logger.info(`Message leaf index: ${messageLeafIndex}`);

  if (options.skipClaim) {
    logger.info("Skipping L2 claim (--skip-claim)");
    logger.info(`Claim secret: ${claimSecret.toString()}`);
    return;
  }

  // Wait for L2 to process
  logger.info("Waiting for L2 to process message (~90s)...");
  await sleep(90000);

  // L2 Claim Setup
  const deployerSecret = process.env.DEPLOYER_SECRET;
  if (!deployerSecret) {
    throw new Error("DEPLOYER_SECRET required for L2 claim");
  }

  const pxeConfig = { ...getPXEConfig(), proverEnabled: true };
  const storeDir = `${options.network}-fpc-store-${Date.now()}/`;
  const pxeOptions: PXECreationOptions = {
    store: await createStore(storeDir, 2, {
      dataDirectory: storeDir,
      dataStoreMapSizeKb: 1e6,
    }),
  };
  const pxe = await createPXE(node, pxeConfig, pxeOptions);

  // Create account
  const secret = await poseidon2Hash([
    Fr.fromBufferReduce(Buffer.from(deployerSecret, "utf8")),
  ]);
  const wallet = new MinimalWallet(pxe, node);
  const signingKey = deriveSigningKey(secret);
  const accountContract = new SingleKeyAccountContract(signingKey);
  const manager = await AccountManager.create(
    wallet,
    secret,
    accountContract,
    Fr.ZERO,
  );
  const account = await manager.getAccount();
  const instance = manager.getInstance();
  const artifact = await manager.getAccountContract().getContractArtifact();
  await wallet.registerContract(instance, artifact, manager.getSecretKey());
  wallet.addAccount(account);

  logger.info(`L2 Account: ${account.getAddress()}`);

  // Register Sponsored FPC
  const sponsoredFPC = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    { salt: new Fr(SPONSORED_FPC_SALT) },
  );
  try {
    await pxe.registerContract({
      instance: sponsoredFPC,
      artifact: SponsoredFPCContract.artifact,
    });
  } catch {
    logger.debug("SponsoredFPC already registered");
  }
  const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

  // Register FeeJuice
  const { getCanonicalFeeJuice } =
    await import("@aztec/protocol-contracts/fee-juice");
  const feeJuiceL2 = await getCanonicalFeeJuice();
  try {
    await pxe.registerContract({
      instance: feeJuiceL2.instance,
      artifact: feeJuiceL2.artifact,
    });
  } catch {
    logger.debug("FeeJuice already registered");
  }

  const feeJuiceContract = await FeeJuiceContract.at(
    feeJuiceL2.instance.address,
    wallet,
  );

  // Claim
  logger.info("Claiming on L2...");
  const tx = await feeJuiceContract.methods
    .claim(fpcAddress, amount, claimSecret, new Fr(messageLeafIndex))
    .send({
      from: account.getAddress(),
      fee: { paymentMethod },
    });

  const txHash = await tx.getTxHash();
  logger.info(`Claim tx: ${txHash}`);

  const receipt = await tx.wait({ timeout: 120 });
  logger.info(`Claim confirmed in block ${receipt.blockNumber}`);

  logger.info("\n=== Success! ===");
  logger.info(`FPC ${fpcAddress} now has ${Number(amount) / 1e18} FJ`);
}

const program = new Command();

program
  .name("fund-fpc")
  .description("Bridge Fee Juice from L1 to L2 and claim to FPC")
  .version("1.0.0")
  .requiredOption("-a, --amount <amount>", "Amount in wei (1 FJ = 1e18)")
  .option("-n, --network <network>", "Network: devnet, testnet", "devnet")
  .option("--fpc-address <address>", "FPC address (defaults to deployment)")
  .option("--skip-claim", "Only bridge, skip L2 claim")
  .option("--dry-run", "Show what would be done")
  .action(async (opts: Options) => {
    try {
      await fundFpc(opts);
      process.exit(0);
    } catch (error) {
      logger.error("Failed:", error);
      process.exit(1);
    }
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse(process.argv);
}
