import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const nobleUtilsPath = pathResolve(
  __dirname,
  "node_modules/@noble/hashes/esm/utils.js",
);

export default defineConfig({
  resolve: {
    alias: {
      "@noble/hashes/utils": nobleUtilsPath,
    },
    conditions: ["import", "module", "browser", "default"],
  },
  test: {
    testTimeout: 30_000,
    include: ["src/ts/agent/test/**/*.test.ts"],
    fileParallelism: false,
    server: {
      deps: {
        inline: [
          /zod/,
          /viem/,
          /pino/,
          /@aztec/,
          /@noble\/(hashes|curves|ciphers)/,
          /@scure/,
        ],
      },
    },
  },
});
