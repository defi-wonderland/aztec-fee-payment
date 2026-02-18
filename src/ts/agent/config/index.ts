import "dotenv/config";
import { configSchema, type AgentConfig } from "../types/index.js";
import { parseChainsFromEnv } from "./schema.js";

function safeParseBigInt(value: string): bigint | string {
  try {
    return BigInt(value);
  } catch {
    return value;
  }
}

/**
 * Load and validate agent configuration from environment variables.
 *
 * Required env vars: SP_SIGNING_KEY, FPC_ADDRESS, OWNER_ADDRESS, plus at
 * least one CHAIN_<id>_* group.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AgentConfig {
  const chains = parseChainsFromEnv(env);

  const raw = {
    port: env.PORT ? Number(env.PORT) : undefined,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
    chains,
    spSigningKey: env.SP_SIGNING_KEY,
    minAmount: env.MIN_AMOUNT ? safeParseBigInt(env.MIN_AMOUNT) : undefined,
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS
        ? Number(env.RATE_LIMIT_WINDOW_MS)
        : undefined,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS
        ? Number(env.RATE_LIMIT_MAX_REQUESTS)
        : undefined,
    },
    aztec: {
      fpcAddress: env.FPC_ADDRESS,
      ownerAddress: env.OWNER_ADDRESS,
    },
    signerMode: env.SIGNER_MODE,
    signerLambdaArn: env.SIGNER_LAMBDA_ARN,
    signerLambdaRegion: env.SIGNER_LAMBDA_REGION,
  };

  return configSchema.parse(raw) as AgentConfig;
}
