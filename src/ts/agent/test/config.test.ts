import { describe, it, expect } from "vitest";
import { loadConfig } from "../config/index.js";
import { parseChainsFromEnv } from "../config/schema.js";
import { createTestEnv } from "./helpers.js";

describe("Configuration", () => {
  describe("loadConfig", () => {
    it("loads a valid config from env vars", () => {
      const env = createTestEnv();
      const config = loadConfig(env);

      expect(config.port).toBe(3000);
      expect(config.host).toBe("0.0.0.0");
      expect(config.logLevel).toBe("info");
      expect(config.spSigningKey).toBe(env.SP_SIGNING_KEY);
      expect(config.aztec.fpcAddress).toBe(env.FPC_ADDRESS);
      expect(config.aztec.ownerAddress).toBe(env.OWNER_ADDRESS);
    });

    it("applies default values for optional fields", () => {
      const env = createTestEnv();
      delete (env as any).PORT;
      delete (env as any).HOST;
      delete (env as any).LOG_LEVEL;

      const config = loadConfig(env);

      expect(config.port).toBe(3000);
      expect(config.host).toBe("0.0.0.0");
      expect(config.logLevel).toBe("info");
      expect(config.rateLimit.windowMs).toBe(60_000);
      expect(config.rateLimit.maxRequests).toBe(100);
    });

    it("throws when SP_SIGNING_KEY is missing", () => {
      const env = createTestEnv();
      delete (env as any).SP_SIGNING_KEY;

      expect(() => loadConfig(env)).toThrow();
    });

    it("throws when FPC_ADDRESS is missing", () => {
      const env = createTestEnv();
      delete (env as any).FPC_ADDRESS;

      expect(() => loadConfig(env)).toThrow();
    });

    it("throws when OWNER_ADDRESS is missing", () => {
      const env = createTestEnv();
      delete (env as any).OWNER_ADDRESS;

      expect(() => loadConfig(env)).toThrow();
    });

    it("throws when no chains are configured", () => {
      const env = createTestEnv();
      // Remove all CHAIN_ vars
      for (const key of Object.keys(env)) {
        if (key.startsWith("CHAIN_")) delete (env as any)[key];
      }

      expect(() => loadConfig(env)).toThrow(
        "At least one chain must be configured",
      );
    });

    it("rejects an invalid SP_SIGNING_KEY (not hex)", () => {
      const env = createTestEnv({ SP_SIGNING_KEY: "not-hex" });

      expect(() => loadConfig(env)).toThrow();
    });

    it("rejects an invalid PORT", () => {
      const env = createTestEnv({ PORT: "99999" });

      expect(() => loadConfig(env)).toThrow();
    });

    it("rejects an invalid LOG_LEVEL", () => {
      const env = createTestEnv({ LOG_LEVEL: "verbose" });

      expect(() => loadConfig(env)).toThrow();
    });

    it("parses multiple chains", () => {
      const env = createTestEnv({
        CHAIN_8453_NAME: "base-mainnet",
        CHAIN_8453_RPC_URL: "https://mainnet.base.org",
        CHAIN_8453_FEE_COLLECTOR: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        CHAIN_8453_AZT_TOKEN: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        CHAIN_8453_CONFIRMATIONS: "12",
      });

      const config = loadConfig(env);

      expect(Object.keys(config.chains)).toHaveLength(2);
      expect(config.chains[84532]).toBeDefined();
      expect(config.chains[8453]).toBeDefined();
      expect(config.chains[8453].name).toBe("base-mainnet");
      expect(config.chains[8453].requiredConfirmations).toBe(12);
    });

    it("uses custom rate limit values", () => {
      const env = createTestEnv({
        RATE_LIMIT_WINDOW_MS: "30000",
        RATE_LIMIT_MAX_REQUESTS: "50",
      });

      const config = loadConfig(env);

      expect(config.rateLimit.windowMs).toBe(30_000);
      expect(config.rateLimit.maxRequests).toBe(50);
    });
  });

  describe("parseChainsFromEnv", () => {
    it("parses chain env vars correctly", () => {
      const env = {
        CHAIN_84532_RPC_URL: "https://sepolia.base.org",
        CHAIN_84532_FEE_COLLECTOR: "0x1111111111111111111111111111111111111111",
        CHAIN_84532_AZT_TOKEN: "0x2222222222222222222222222222222222222222",
        CHAIN_84532_CONFIRMATIONS: "6",
      };

      const chains = parseChainsFromEnv(env);

      expect(chains[84532]).toBeDefined();
      expect(chains[84532].rpcUrl).toBe("https://sepolia.base.org");
      expect(chains[84532].requiredConfirmations).toBe(6);
    });

    it("uses default name when CHAIN_<id>_NAME is not set", () => {
      const env = {
        CHAIN_1_RPC_URL: "https://eth.rpc",
        CHAIN_1_FEE_COLLECTOR: "0x1111111111111111111111111111111111111111",
        CHAIN_1_AZT_TOKEN: "0x2222222222222222222222222222222222222222",
      };

      const chains = parseChainsFromEnv(env);

      expect(chains[1].name).toBe("chain-1");
    });

    it("defaults confirmations to 1 when not set", () => {
      const env = {
        CHAIN_1_RPC_URL: "https://eth.rpc",
        CHAIN_1_FEE_COLLECTOR: "0x1111111111111111111111111111111111111111",
        CHAIN_1_AZT_TOKEN: "0x2222222222222222222222222222222222222222",
      };

      const chains = parseChainsFromEnv(env);

      expect(chains[1].requiredConfirmations).toBe(1);
    });

    it("skips incomplete chain configs (missing RPC_URL)", () => {
      const env = {
        CHAIN_42_FEE_COLLECTOR: "0x1111111111111111111111111111111111111111",
        CHAIN_42_AZT_TOKEN: "0x2222222222222222222222222222222222222222",
      };

      const chains = parseChainsFromEnv(env);

      expect(chains[42]).toBeUndefined();
    });

    it("returns empty object when no chain vars are present", () => {
      const chains = parseChainsFromEnv({ FOO: "bar" });

      expect(Object.keys(chains)).toHaveLength(0);
    });
  });
});
