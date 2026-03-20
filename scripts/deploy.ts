import "dotenv/config";
import { Command } from "commander";
import { PublicKeys } from "@aztec/aztec.js/keys";
import {
  getContractInstanceFromInstantiationParams,
  type InteractionFeeOptions,
} from "@aztec/aztec.js/contracts";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { AccountWithSecretKey, Account } from "@aztec/aztec.js/account";
import { AccountManager, type Wallet } from "@aztec/aztec.js/wallet";
import { BaseWallet } from "@aztec/wallet-sdk/base-wallet";
import {
  createAztecNodeClient,
  type AztecNode,
  waitForNode,
} from "@aztec/aztec.js/node";
import { createLogger } from "@aztec/foundation/log";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { registerInitialLocalNetworkAccountsInWallet } from "@aztec/wallets/testing";

import { SingleKeyAccountContract } from "@aztec/accounts/single_key";
import { deriveSigningKey } from "@aztec/stdlib/keys";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { SPONSORED_FPC_SALT } from "@aztec/constants";
import { poseidon2Hash } from "@aztec/foundation/crypto/poseidon";

// Import artifacts
import { BridgedFPCContractArtifact } from "../src/artifacts/BridgedFPC.js";

import {
  DeployedContracts,
  DeploymentData,
  getDeploymentData,
  saveDeploymentData,
} from "./utils.js";
import { createStore } from "@aztec/kv-store/lmdb-v2";
import { createPXE, getPXEConfig } from "@aztec/pxe/server";
import type { PXE, PXECreationOptions } from "@aztec/pxe/server";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Import config
import config, { DeploymentConfig } from "../config/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8"),
);

const logger = createLogger("aztec:deploy");

// CLI options interface
type Network = "devnet" | "testnet" | "local-network";

interface CLIOptions {
  deployerSecret?: string;
  dryRun?: boolean;
  output?: string;
  network: Network;
}

export function logDeployedContracts(contracts: DeployedContracts): void {
  logger.info("Deployed contracts:");

  for (const [key, value] of Object.entries(contracts)) {
    if (value instanceof AccountWithSecretKey) {
      logger.info(`${key}: ${value.getAddress().toString()}`);
    } else {
      logger.info(`${key}: ${value}`);
    }
  }
}

export async function setupPXE(
  node: AztecNode,
  config: DeploymentConfig,
): Promise<PXE> {
  const pxeVersion = config.deployer.pxeVersion;

  // Enable prover for devnet/testnet (required for BaseWallet)
  // Disable for local-network (not needed)
  const proverEnabled = config.network.name !== "local-network";

  const pxeConfig = {
    ...getPXEConfig(),
    proverEnabled,
  };
  const options: PXECreationOptions = {
    store: await createStore(config.deployer.dataDirectory, pxeVersion, {
      dataDirectory: config.deployer.dataDirectory,
      dataStoreMapSizeKb: 1e6,
    }),
  };
  const pxe = await createPXE(node, pxeConfig, options);
  logger.info("Connected to PXE");

  try {
    const nodeInfo = await node.getNodeInfo();
    logger.info(`Connected to Aztec node version: ${nodeInfo.nodeVersion}`);
  } catch (error) {
    logger.error("Failed to connect to PXE:", error);
    throw error;
  }

  return pxe;
}

class MinimalWallet extends BaseWallet {
  private readonly addressToAccount = new Map<string, AccountWithSecretKey>();

  constructor(pxe: PXE, aztecNode: AztecNode) {
    super(pxe, aztecNode);
  }

  public addAccount(account: AccountWithSecretKey) {
    this.addressToAccount.set(account.getAddress().toString(), account);
  }

  protected async getAccountFromAddress(
    address: AztecAddress,
  ): Promise<Account> {
    const acc = this.addressToAccount.get(address.toString());
    if (!acc)
      throw new Error(
        `Account not found in wallet for address: ${address.toString()}`,
      );
    return acc;
  }

  async getAccounts(): Promise<{ alias: string; item: AztecAddress }[]> {
    return Array.from(this.addressToAccount.values()).map((acc) => ({
      alias: "",
      item: acc.getAddress(),
    }));
  }
}

export async function createAccount(
  pxe: PXE,
  node: AztecNode,
  secretStr: string,
  networkName: string,
): Promise<{ wallet: Wallet; account: AccountWithSecretKey }> {
  logger.info("Creating account...");

  // For local-network, use EmbeddedWallet with pre-deployed accounts
  if (networkName === "local-network") {
    const wallet = await EmbeddedWallet.create(node, {
      pxeConfig: {
        dataDirectory: "deployer-wallet-local/",
        proverEnabled: false,
      },
    });
    const accounts = await registerInitialLocalNetworkAccountsInWallet(wallet);
    if (accounts.length === 0) {
      throw new Error("No local network accounts available");
    }
    const accountAddress = accounts[0]!;
    logger.info(`Using local network account: ${accountAddress.toString()}`);
    // Local-network only needs getAddress() for deployment purposes.
    // Callers should not rely on other AccountWithSecretKey methods for this path.
    const account = {
      getAddress: () => accountAddress,
    } as Pick<AccountWithSecretKey, "getAddress"> as AccountWithSecretKey;
    return { wallet, account };
  }

  // For testnet/devnet, use AccountManager with SingleKeyAccountContract
  const deployerSecret = await poseidon2Hash([
    Fr.fromBufferReduce(Buffer.from(secretStr, "utf8")),
  ]);

  const wallet = new MinimalWallet(pxe, node);
  const signingKey = deriveSigningKey(deployerSecret);
  const accountContract = new SingleKeyAccountContract(signingKey);
  const manager = await AccountManager.create(
    wallet,
    deployerSecret,
    accountContract,
    Fr.ZERO,
  );
  const account = await manager.getAccount();
  const instance = manager.getInstance();
  const artifact = await manager.getAccountContract().getContractArtifact();
  await wallet.registerContract(instance, artifact, manager.getSecretKey());
  (wallet as MinimalWallet).addAccount(account);

  logger.info(`Account created: ${account.getAddress().toString()}`);
  return { wallet, account };
}

export async function createSponsoredFeeOptions(
  pxe: PXE,
  networkName: string,
): Promise<InteractionFeeOptions | undefined> {
  if (networkName === "local-network") {
    return undefined;
  }

  logger.info("Setting up sponsored fee options...");

  const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    {
      salt: new Fr(SPONSORED_FPC_SALT),
    },
  );

  try {
    await pxe.registerContract({
      instance: sponsoredFPCInstance,
      artifact: SponsoredFPCContract.artifact,
    });
    logger.info(
      `Registered SponsoredFPC at: ${sponsoredFPCInstance.address.toString()}`,
    );
  } catch (error) {
    logger.debug("SponsoredFPC already registered");
  }

  const paymentMethod = new SponsoredFeePaymentMethod(
    sponsoredFPCInstance.address,
  );

  return {
    paymentMethod,
  };
}

async function computeBridgedAddress(
  config: DeploymentConfig,
): Promise<AztecAddress> {
  // BridgedFPC is fully private: no constructor, no public initializer.
  // Its address is derived deterministically from the class hash + salt.
  const bridgedSalt = Fr.fromString(config.contracts.bridged.salt);
  const bridgedInstance = await getContractInstanceFromInstantiationParams(
    BridgedFPCContractArtifact,
    {
      constructorArgs: [],
      salt: bridgedSalt,
      publicKeys: PublicKeys.default(),
      deployer: AztecAddress.ZERO,
    },
  );
  return bridgedInstance.address;
}

export async function deployToNetwork(
  options: CLIOptions,
  config: DeploymentConfig,
): Promise<DeployedContracts> {
  logger.info(`Deploying to ${config.network.name}...`);
  logger.info(`Network: ${config.network.nodeUrl}`);

  if (options.dryRun) {
    logger.info("[DRY RUN] Computing contract addresses...");
    const bridgedAddress = await computeBridgedAddress(config);

    const deploymentData: DeploymentData = {
      bridged: {
        address: bridgedAddress.toString(),
        salt: config.contracts.bridged.salt,
      },
    };

    logger.info("[DRY RUN] Deployment data:");
    logger.info(JSON.stringify(deploymentData, null, 4));
    return {};
  }

  try {
    const nodeUrl = config.network.nodeUrl;

    const deployerSecretStr =
      options.deployerSecret || process.env.DEPLOYER_SECRET;
    if (!deployerSecretStr) {
      throw new Error(
        "Deployer secret is required (use --deployer-secret or DEPLOYER_SECRET env var)",
      );
    }

    const node = createAztecNodeClient(nodeUrl, {});

    if (config.network.name === "local-network") {
      try {
        const response = await fetch(`${nodeUrl}/status`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        await response.text();
      } catch (error) {
        logger.error(`Failed to connect to local network at ${nodeUrl}`);
        logger.error(
          "Make sure the Aztec local network is running: aztec start --local-network --port 8080",
        );
        throw error;
      }
      await waitForNode(node);
    }

    // Compute and display bridged address
    const bridgedAddress = await computeBridgedAddress(config);
    logger.info("\n=== Computed Contract Addresses ===");
    logger.info(`BridgedFPC: ${bridgedAddress.toString()}`);
    logger.info("===================================\n");

    logger.info("Address computation completed. No contracts were deployed.");

    const deployedContracts: DeployedContracts = {};

    return deployedContracts;
  } catch (error) {
    // Check if this is a PXE sync error (non-fatal for deployments)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("blockHeadersHash") ||
      errorMessage.includes("ZodError")
    ) {
      logger.warn(
        "PXE synchronization error detected. This is usually a version mismatch between PXE and node.",
      );
      logger.warn(
        "The deployment may have still succeeded. Check the contract address above.",
      );
      logger.warn(
        "If deployment failed, try: 1) Update Aztec packages, 2) Clear PXE data directory, 3) Check node version compatibility",
      );
    }
    logger.error("Deployment failed:", error);
    throw error;
  }
}

const program = new Command();

// Network-specific configuration overrides
// These override the base config from config/config.ts
const networkConfigs: Record<Network, Partial<DeploymentConfig>> = {
  devnet: {
    network: {
      nodeUrl: process.env.AZTEC_NODE_URL || "https://devnet-6.aztec-labs.com/",
      name: "devnet",
    },
    deployer: {
      pxeVersion: 2,
      dataDirectory: "devnet-store/",
    },
  },
  testnet: {
    network: {
      nodeUrl: process.env.AZTEC_NODE_URL || "https://testnet.aztec-labs.com",
      name: "testnet",
    },
    deployer: {
      pxeVersion: 2,
      dataDirectory: "testnet-store/",
    },
  },
  "local-network": {
    network: {
      nodeUrl: "http://localhost:8080",
      name: "local-network",
    },
    deployer: {
      pxeVersion: 2,
      dataDirectory: "local-network-store/",
    },
    deployment: {
      retryOptions: config.deployment.retryOptions,
      waitTimeout: 600,
      deployDelay: 1000,
    },
  },
};

function getActiveConfig(network: Network): DeploymentConfig {
  const overrides = networkConfigs[network];
  return {
    ...config,
    ...overrides,
    network: { ...config.network, ...overrides.network },
    deployer: { ...config.deployer, ...overrides.deployer },
    deployment: {
      ...config.deployment,
      ...overrides.deployment,
      retryOptions: {
        ...config.deployment.retryOptions,
        ...overrides.deployment?.retryOptions,
      },
    },
    contracts: { ...config.contracts, ...overrides.contracts },
  };
}

program
  .name("deploy")
  .description("Deploy Fee Payment Contracts")
  .version(packageJson.version)
  .option(
    "--deployer-secret <secret>",
    "Deployer secret (or use DEPLOYER_SECRET env var)",
  )
  .option("--dry-run", "Show configuration without deploying")
  .option("--output <file>", "Write deployment JSON to file")
  .option(
    "-n, --network <network>",
    "Target network: devnet, testnet, local-network",
    "devnet",
  )
  .action(async (options: CLIOptions) => {
    try {
      const activeConfig = getActiveConfig(options.network);

      const contracts = await deployToNetwork(options, activeConfig);
      logDeployedContracts(contracts);

      const bridgedAddress = await computeBridgedAddress(activeConfig);
      const deploymentData = getDeploymentData(activeConfig, bridgedAddress);

      if (options.output) {
        const filePath = saveDeploymentData(
          deploymentData,
          options.network,
          options.output,
        );
        logger.info(`Deployment data written to ${filePath}`);
      } else {
        // Auto-save to deployments directory
        const filePath = saveDeploymentData(deploymentData, options.network);
        logger.info(`Deployment data auto-saved to ${filePath}`);
      }

      process.exit(0);
    } catch (error) {
      logger.error("Deployment failed:", error);
      process.exit(1);
    }
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse(process.argv);
}
