import { AztecAddress } from "@aztec/aztec.js/addresses";
import { MeteredContract } from "../src/artifacts/Metered.js";
import { AccountWithSecretKey } from "@aztec/aztec.js/account";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { createLogger } from "@aztec/foundation/log";
import type { DeploymentConfig } from "../config/config.js";

const logger = createLogger("aztec:utils");

// DeployedContracts interface
export interface DeployedContracts {
  metered?: {
    contract: MeteredContract;
    status: "deployed" | "existing";
  } | null;
  deployer?: AccountWithSecretKey;
}

export interface DeploymentMetered {
  address: string;
  salt: string;
  deployer: string;
  constructorArtifact?: string; // Optional since Metered contract has no constructor
}

export interface DeploymentData {
  metered?: DeploymentMetered;
}

export interface DeployedContract<T> {
  contract: T;
  status: "deployed" | "existing";
}

export interface DeploymentContracts {
  metered?: DeployedContract<MeteredContract>;
}

const UNIVERSAL_DEPLOYER =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export function getDeploymentData(
  contracts: DeploymentContracts | null | undefined,
  config: DeploymentConfig,
): DeploymentData {
  if (!contracts || !contracts.metered) {
    return {};
  }

  const result: DeploymentData = {};

  if (contracts.metered) {
    result.metered = {
      address: contracts.metered.contract.address.toString(),
      salt: config.contracts.metered.salt,
      deployer: UNIVERSAL_DEPLOYER,
      constructorArtifact: undefined, // Metered contract has no constructor
    };
  }

  return result;
}

export function saveDeploymentData(
  deploymentData: DeploymentData,
  network: string,
  outputPath?: string,
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const filename =
    outputPath || `deployments/${network}/deployment-${timestamp}.json`;
  const filePath = join(process.cwd(), filename);

  // Ensure directory exists
  mkdirSync(dirname(filePath), { recursive: true });

  // Write deployment data
  writeFileSync(filePath, JSON.stringify(deploymentData, null, 2));
  logger.info(`Deployment data saved to ${filePath}`);

  return filePath;
}

export function loadDeploymentData(
  network: string,
  filename?: string,
): DeploymentData | null {
  if (!filename) {
    // Try to find the latest deployment file
    const deploymentsDir = join(process.cwd(), `deployments/${network}`);
    if (!existsSync(deploymentsDir)) {
      return null;
    }

    // This is a simplified version - in a real scenario, you might want to list and sort files
    logger.warn("No filename provided, cannot auto-detect latest deployment");
    return null;
  }

  const filePath = join(process.cwd(), `deployments/${network}/${filename}`);
  if (!existsSync(filePath)) {
    logger.warn(`Deployment file not found: ${filePath}`);
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as DeploymentData;
  } catch (error) {
    logger.error(`Failed to load deployment data from ${filePath}:`, error);
    return null;
  }
}
