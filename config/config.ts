export interface MeteredConfig {
  salt: string;
  existingAddress?: string;
}

export interface DeploymentConfig {
  network: {
    nodeUrl: string;
    name: string;
  };
  deployer: {
    pxeVersion: number;
    dataDirectory: string;
  };
  contracts: {
    metered: MeteredConfig;
  };
  deployment: {
    retryOptions: {
      maxRetries: number;
      initialDelayMs: number;
      backoffMultiplier: number;
      maxDelayMs: number;
    };
    waitTimeout: number;
    deployDelay: number;
  };
}

// Base configuration - provides defaults
// Network-specific overrides are defined in scripts/deploy.ts networkConfigs
const config: DeploymentConfig = {
  network: {
    nodeUrl: process.env.AZTEC_NODE_URL || "https://devnet-6.aztec-labs.com/",
    name: "devnet",
  },
  deployer: {
    pxeVersion: 2,
    dataDirectory: "deployer-store/",
  },
  contracts: {
    metered: { salt: "1337" },
  },
  deployment: {
    retryOptions: {
      maxRetries: 3,
      initialDelayMs: 5000,
      backoffMultiplier: 2,
      maxDelayMs: 30000,
    },
    waitTimeout: 600,
    deployDelay: 24000,
  },
};

export default config;
