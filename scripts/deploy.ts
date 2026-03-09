import "dotenv/config";
import { Command } from "commander";
import { PublicKeys } from "@aztec/aztec.js/keys";
import {
  getContractInstanceFromInstantiationParams,
  DeployMethod,
  Contract,
  DeployOptions,
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
import { sleep } from "@aztec/foundation/sleep";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { registerInitialLocalNetworkAccountsInWallet } from "@aztec/wallets/testing";

import { SingleKeyAccountContract } from "@aztec/accounts/single_key";
import { deriveSigningKey } from "@aztec/stdlib/keys";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { SPONSORED_FPC_SALT } from "@aztec/constants";
import { poseidon2Hash } from "@aztec/foundation/crypto/poseidon";

// Import artifacts
import {
  MeteredFPCContract,
  MeteredFPCContractArtifact,
} from "../src/artifacts/MeteredFPC.js";
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
import {
  maybeUploadArtifactToRegistry,
  getArtifactRegistryBaseUrl,
  shouldUploadArtifacts,
} from "../src/ts/artifactRegistry.js";

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

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: RetryOptions,
): Promise<T> {
  const { maxRetries, initialDelayMs, backoffMultiplier, maxDelayMs } = options;

  let lastError: Error;
  let delayMs = initialDelayMs!;

  for (let attempt = 1; attempt <= maxRetries!; attempt++) {
    try {
      logger.info(`${operationName}: Attempt ${attempt}/${maxRetries}`);
      return await operation();
    } catch (error) {
      lastError = error as Error;
      logger.warn(`${operationName}: Attempt ${attempt} failed:`, error);

      if (attempt < maxRetries!) {
        const actualDelay = Math.min(delayMs, maxDelayMs!);
        logger.info(
          `${operationName}: Retrying in ${actualDelay / 1000} seconds...`,
        );
        await sleep(actualDelay);
        delayMs *= backoffMultiplier!;
      }
    }
  }

  logger.error(`${operationName}: All ${maxRetries} attempts failed`);
  throw lastError!;
}

export function logDeployedContracts(contracts: DeployedContracts): void {
  logger.info("Deployed contracts:");

  for (const [key, value] of Object.entries(contracts)) {
    if (value && typeof value === "object" && "contract" in value) {
      const status =
        value.status === "deployed" ? "[NEWLY DEPLOYED]" : "[EXISTING]";
      logger.info(`${key}: ${value.contract.address.toString()} ${status}`);
    } else if (value instanceof AccountWithSecretKey) {
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
    super(pxe as unknown as any, aztecNode);
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
    const account = {
      getAddress: () => accountAddress,
    } as AccountWithSecretKey;
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

async function checkContractDeployed(
  node: AztecNode,
  address: AztecAddress,
): Promise<boolean> {
  try {
    const instance = await node.getContract(address);
    return instance != null;
  } catch (error) {
    return false;
  }
}

export async function deployMetered(
  deployer: Wallet,
  node: AztecNode,
  pxe: PXE,
  salt: Fr,
  options: DeployOptions,
  owner: AztecAddress,
): Promise<{ contract: MeteredFPCContract; status: "deployed" | "existing" }> {
  logger.info("Checking Metered contract...");

  const instance = await getContractInstanceFromInstantiationParams(
    MeteredFPCContractArtifact,
    {
      constructorArgs: [owner],
      salt,
      publicKeys: PublicKeys.default(),
      deployer: AztecAddress.ZERO,
    },
  );

  const isDeployed = await checkContractDeployed(node, instance.address);

  if (isDeployed) {
    logger.info(`Metered already deployed at: ${instance.address.toString()}`);

    try {
      await pxe.registerContract({
        instance,
        artifact: MeteredFPCContractArtifact,
      });
      logger.debug("MeteredFPC registered with PXE");
    } catch (error) {
      logger.debug("MeteredFPC already registered with PXE");
    }

    const meteredContract = await MeteredFPCContract.at(
      instance.address,
      deployer,
    );
    return { contract: meteredContract, status: "existing" };
  }

  logger.info("Deploying Metered contract...");

  const deployMethod = new DeployMethod(
    PublicKeys.default(),
    deployer,
    MeteredFPCContractArtifact,
    (address) =>
      Contract.at(address.address, MeteredFPCContractArtifact, deployer),
    [owner],
  );

  options = {
    ...options,
    contractAddressSalt: salt,
    universalDeploy: true,
  };

  const contract = await deployMethod.send({ ...options });

  logger.info(`Metered deployed at: ${contract.address.toString()}`);

  await sleep(2000);

  const deployedInstance = await node.getContract(contract.address);
  if (deployedInstance) {
    try {
      await pxe.registerContract({
        instance: deployedInstance,
        artifact: MeteredFPCContractArtifact,
      });
      logger.debug("MeteredFPC registered with PXE");
    } catch (error) {
      logger.debug("MeteredFPC already registered with PXE");
    }
  }

  const meteredContract = await MeteredFPCContract.at(
    contract.address,
    deployer,
  );
  return { contract: meteredContract, status: "deployed" };
}

export async function deployMeteredWithRetry(
  deployer: Wallet,
  node: AztecNode,
  pxe: PXE,
  salt: Fr,
  options: DeployOptions,
  retryOptions: RetryOptions,
  owner: AztecAddress,
): Promise<{ contract: MeteredFPCContract; status: "deployed" | "existing" }> {
  return withRetry(
    () => deployMetered(deployer, node, pxe, salt, options, owner),
    "Deploy MeteredFPC",
    retryOptions,
  );
}

interface ComputedAddresses {
  metered: AztecAddress;
  bridged: AztecAddress;
}

async function computeMeteredAddress(
  config: DeploymentConfig,
  owner: AztecAddress,
): Promise<AztecAddress> {
  if (config.contracts.metered.existingAddress) {
    return AztecAddress.fromString(config.contracts.metered.existingAddress);
  }
  // MeteredFPC constructor takes the owner (= deployer); address depends on it.
  const meteredSalt = Fr.fromString(config.contracts.metered.salt);
  const meteredInstance = await getContractInstanceFromInstantiationParams(
    MeteredFPCContractArtifact,
    {
      constructorArgs: [owner],
      salt: meteredSalt,
      publicKeys: PublicKeys.default(),
      deployer: AztecAddress.ZERO,
    },
  );
  return meteredInstance.address;
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

async function computeContractAddresses(
  config: DeploymentConfig,
  owner: AztecAddress,
): Promise<ComputedAddresses> {
  return {
    metered: await computeMeteredAddress(config, owner),
    bridged: await computeBridgedAddress(config),
  };
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
    const meteredAddress = config.contracts.metered.existingAddress
      ? AztecAddress.fromString(config.contracts.metered.existingAddress)
      : null;

    const universalDeployer = AztecAddress.ZERO.toString();

    const deploymentData: DeploymentData = {
      metered: {
        address:
          meteredAddress?.toString() ??
          "(requires deployer secret — run without --dry-run)",
        salt: config.contracts.metered.salt,
        deployer: universalDeployer,
      },
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

    const pxe = await setupPXE(node, config);
    const deployer = await createAccount(
      pxe,
      node,
      deployerSecretStr,
      config.network.name,
    );
    logger.info(
      `Deployer account: ${deployer.account.getAddress().toString()}`,
    );
    const sponsoredFeeOptions = await createSponsoredFeeOptions(
      pxe,
      config.network.name,
    );

    const deployOptions: DeployOptions = {
      from: deployer.account.getAddress(),
      ...(sponsoredFeeOptions && { fee: sponsoredFeeOptions }),
    };

    logger.info(
      `Deploying with account: ${deployer.account.getAddress().toString()}`,
    );

    // Compute and display addresses before deployment
    const computedAddresses = await computeContractAddresses(
      config,
      deployer.account.getAddress(),
    );
    logger.info("\n=== Computed Contract Addresses ===");
    logger.info(`MeteredFPC: ${computedAddresses.metered.toString()}`);
    logger.info(`BridgedFPC: ${computedAddresses.bridged.toString()}`);
    logger.info("===================================\n");

    // Deploy or use existing metered
    let metered: {
      contract: MeteredFPCContract;
      status: "deployed" | "existing";
    } | null = null;

    if (config.contracts.metered.existingAddress) {
      logger.info(
        `Using existing metered at ${config.contracts.metered.existingAddress}`,
      );
      const meteredAddress = AztecAddress.fromString(
        config.contracts.metered.existingAddress,
      );

      const meteredInstance = await node.getContract(meteredAddress);
      if (!meteredInstance) throw new Error("MeteredFPC not found");

      logger.info(`MeteredFPC found at: ${meteredAddress.toString()}`);

      try {
        await pxe.registerContract({
          instance: meteredInstance,
          artifact: MeteredFPCContractArtifact,
        });
        logger.debug("MeteredFPC registered with PXE");
      } catch (error) {
        logger.debug("MeteredFPC already registered with PXE");
      }

      const meteredContract = await MeteredFPCContract.at(
        meteredAddress,
        deployer.wallet,
      );
      metered = { contract: meteredContract, status: "existing" };
    } else {
      logger.info("Deploying or checking metered contract...");
      const meteredSalt = Fr.fromString(config.contracts.metered.salt);
      metered = await deployMeteredWithRetry(
        deployer.wallet,
        node,
        pxe,
        meteredSalt,
        deployOptions,
        config.deployment.retryOptions,
        deployer.account.getAddress(),
      );
    }

    if (!metered) {
      throw new Error("MeteredFPC deployment failed");
    }

    logger.info("Deployment completed successfully!");

    const deployedContracts: DeployedContracts = {
      metered,
      deployer: deployer.account,
    };

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
  return { ...config, ...networkConfigs[network] } as DeploymentConfig;
}

program
  .name("deploy")
  .description("Deploy Metered Fee Payment Contract")
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

      // Check if any contract was newly deployed
      const hasNewDeployments = contracts.metered?.status === "deployed";

      if (hasNewDeployments || contracts.metered) {
        const bridgedAddress = await computeBridgedAddress(activeConfig);
        const deploymentData = getDeploymentData(
          {
            metered: contracts.metered || undefined,
          },
          activeConfig,
          bridgedAddress,
        );

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

        // Upload artifacts to registry if enabled and contract was newly deployed
        if (hasNewDeployments && shouldUploadArtifacts()) {
          logger.info("Uploading artifacts to registry...");
          try {
            const resp = await maybeUploadArtifactToRegistry({
              artifact: MeteredFPCContractArtifact,
              filename: "metered_contract-MeteredFPC.json",
              registryBaseUrl: getArtifactRegistryBaseUrl(),
            });
            if (resp) {
              logger.info(
                `Artifact uploaded successfully: ${JSON.stringify(resp, null, 2)}`,
              );
            }
          } catch (error) {
            logger.warn(
              `Failed to upload artifact (non-fatal): ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      } else if (options.output) {
        logger.info("No new contracts deployed, skipping output file creation");
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
