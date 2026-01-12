import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { Fr } from "@aztec/aztec.js/fields";
import type { AllowedElement } from "@aztec/stdlib/config";
import net from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getContractClassIds } from "./get-contract-class-ids.js";

// Global reference for the active sandbox manager
let activeSandboxManager: SandboxManager | null = null;
let signalHandlersSetup = false;

interface SandboxManagerOptions {
  verbose?: boolean;
  /**
   * Allowed setup functions to whitelist for public setup phase.
   * Format: Array of contract class IDs (hex strings without 0x prefix)
   * - If not provided, will auto-detect from repo contracts.
   * - If empty array [], will disable whitelisting (use default local-network behavior).
   * - If `appendToExisting` is true, will append to existing values instead of replacing.
   */
  allowedSetupContractClassIds?: string[];
  /**
   * If true, appends our contract class IDs to any existing defaultAllowedSetupFunctions
   * instead of replacing them. This preserves any existing whitelisted contracts.
   * Defaults to false (replace).
   */
  appendToExisting?: boolean;
}

interface ManagedTimer {
  id: NodeJS.Timeout;
  name: string;
  clear: () => void;
}

/**
 * Setup global signal handlers for graceful shutdown
 */
function setupSignalHandlers(): void {
  if (signalHandlersSetup) return;

  const handleShutdown = async (signal: string): Promise<void> => {
    // Stop the active sandbox manager if it exists
    if (activeSandboxManager) {
      try {
        await activeSandboxManager.stop();
        console.log("✅ Sandbox manager stopped");
      } catch (err) {
        console.error("Error stopping manager:", err);
      }
      activeSandboxManager = null;
    }

    process.exit(0);
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  signalHandlersSetup = true;
}

/**
 * Start the Aztec sandbox and wait for it to be ready
 */
class SandboxManager extends EventEmitter {
  public process: ChildProcess | null = null;
  public isReady = false;
  public isExternalSandbox = false; // Track if we're using external sandbox vs our own process
  public sandboxTimeout = 180000;
  public forceKillTimeout = 5000;
  public maxRetries = 3;
  public verbose: boolean;
  public port: number;
  public url: string;
  private allowedSetupContractClassIds: string[] | undefined;
  private appendToExisting: boolean;

  // Timer/interval tracking for centralized cleanup
  private timers: Record<string, NodeJS.Timeout> = {};

  // Capture stderr for error reporting
  private stderrBuffer: string[] = [];

  constructor(options: SandboxManagerOptions = {}) {
    super();
    // Enable verbose mode in CI environments by default
    this.verbose = options.verbose ?? Boolean(process.env.CI);
    this.port = 8080;
    this.url = "http://localhost:8080";
    this.allowedSetupContractClassIds = options.allowedSetupContractClassIds;
    this.appendToExisting = options.appendToExisting ?? false;

    // Register this manager for signal handling
    activeSandboxManager = this;
    setupSignalHandlers();
  }

  /**
   * Returns true if a local TCP port is available for binding.
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    try {
      await new Promise<void>((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on("error", reject);
        server.listen({ port, host: "::", ipv6Only: false }, () => {
          server.close(() => resolve());
        });
      });
      return true;
    } catch {
      return false;
    }
  }

  private getExpectedAztecVersion(): string {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const packageJsonPath = join(__dirname, "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      config?: { aztecVersion?: string };
    };
    const expected = packageJson.config?.aztecVersion;
    if (!expected) {
      throw new Error("No aztecVersion found in package.json config");
    }
    return expected;
  }

  private async tryConnectAndValidateRunningSandbox(): Promise<boolean> {
    try {
      const aztecNode = await createAztecNodeClient(this.url, {});
      const nodeInfo = await aztecNode.getNodeInfo();
      const expected = this.getExpectedAztecVersion();
      if (nodeInfo.nodeVersion !== expected) {
        throw new Error(
          `Aztec sandbox already running but version mismatch.\n` +
            `Expected: ${expected}\n` +
            `Running:  ${nodeInfo.nodeVersion}`,
        );
      }

      console.log(`🔧 Node version: ${nodeInfo.nodeVersion}`);
      this.isExternalSandbox = true;
      this.isReady = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a managed timer that will be automatically cleaned up
   */
  createManagedTimer(
    callback: () => void,
    delay: number,
    name: string,
  ): ManagedTimer {
    const timerId = setTimeout(() => {
      // Remove from tracked timers when it executes
      delete this.timers[name];
      callback();
    }, delay);

    // Track the timer for cleanup
    this.timers[name] = timerId;

    return {
      id: timerId,
      name,
      clear: () => this.clearManagedTimer(name),
    };
  }

  /**
   * Clear a specific managed timer
   */
  clearManagedTimer(name: string): void {
    if (this.timers[name]) {
      clearTimeout(this.timers[name]);
      delete this.timers[name];
    }
  }

  /**
   * Centralized cleanup of all timers and intervals
   */
  cleanupTimers(): void {
    const timerNames = Object.keys(this.timers);

    for (const name of timerNames) {
      this.clearManagedTimer(name);
    }
  }

  /**
   * Centralized state reset - handles all instance and global state cleanup
   */
  resetState(preserveExternalFlag = false): void {
    // Clean up timers first
    this.cleanupTimers();

    // Reset instance state
    this.process = null;
    this.isReady = false;
    this.stderrBuffer = [];

    // Only reset external flag if not preserving it
    if (!preserveExternalFlag) {
      this.isExternalSandbox = false;
    }

    // Clear global reference
    activeSandboxManager = null;
  }

  /**
   * Standardized error handling - cleanup, logging, and rejection
   */
  handleError(
    error: Error | string,
    context: string,
    safeReject: (error: Error) => void,
  ): void {
    // Always reset state on error
    this.resetState();

    // Create standardized error message
    const errorMessage = error instanceof Error ? error.message : error;
    const contextualError = new Error(`❌ ${errorMessage}`);

    // Log error with context if verbose
    if (this.verbose) {
      console.error(`🚨 Error in ${context}:`, errorMessage);
    }

    // Reject with the error
    safeReject(contextualError);
  }

  /**
   * Spawn the Aztec sandbox process
   */
  async spawnSandboxProcess(): Promise<ChildProcess> {
    // This repo uses the Aztec local network mode.
    const modeFlag: "--local-network" = "--local-network";

    // Speed up local/dev syncing to make L1->L2 message availability close to instant:
    // - archiver polls L2 blocks/logs frequently
    // - sequencer polls tx pool frequently and doesn't enforce slot timetable (builds blocks ASAP when txs exist)
    // - p2p checks for new L2 blocks frequently
    const fastSyncArgs = [
      "--archiver.archiverPollingIntervalMS",
      "50",
      "--sequencer.transactionPollingIntervalMS",
      "50",
      "--sequencer.enforceTimeTable",
      "false",
      "--p2p.blockCheckIntervalMS",
      "50",
    ];

    // Build environment with optional TX_PUBLIC_SETUP_ALLOWLIST
    const env = { ...process.env };

    // If we have custom class IDs to whitelist, set the environment variable
    // IMPORTANT: The format is NOT JSON! It's a comma-separated list with prefixes:
    // - C:0x... for contract class IDs
    // - I:0x... for instance addresses
    // See: docs/issues/LOCAL_NETWORK_SETUP_ALLOWLIST_GUIDE.md
    if (
      this.allowedSetupContractClassIds &&
      this.allowedSetupContractClassIds.length > 0
    ) {
      // Format each class ID with the C: prefix
      const classIdEntries = this.allowedSetupContractClassIds.map((id) => {
        const normalizedId = id.startsWith("0x") ? id : `0x${id}`;
        return `C:${normalizedId}`;
      });

      // Note: This REPLACES the defaults (AuthRegistry, FeeJuice, Token, FPC).
      // To extend defaults, we would need to get them from getDefaultAllowedSetupFunctions()
      // but that requires the network to be running first.
      // The local-network mode may handle defaults differently.

      env.TX_PUBLIC_SETUP_ALLOWLIST = classIdEntries.join(",");

      if (this.verbose) {
        console.log(`📋 Setting TX_PUBLIC_SETUP_ALLOWLIST env var:`);
        console.log(`   ${env.TX_PUBLIC_SETUP_ALLOWLIST}`);
        console.log(`   Format: C:classId for each contract class`);
        if (!this.appendToExisting) {
          console.log(
            `   ⚠️  Note: This replaces default whitelisted contracts`,
          );
        }
      }
    }

    return spawn(
      "aztec",
      ["start", modeFlag, "--port", String(this.port), ...fastSyncArgs],
      {
        stdio: "pipe",
        env,
      },
    );
  }

  /**
   * Setup event handlers for the sandbox process
   */
  setupProcessHandlers(
    process: ChildProcess,
    safeResolve: (value: SandboxManager) => void,
    safeReject: (error: Error) => void,
  ): void {
    // Handle process errors
    process.on("error", (error: any) => {
      if (error.code === "ENOENT") {
        this.handleError(
          "Aztec CLI not found. Please install it with aztec-up",
          "process-spawn",
          safeReject,
        );
      } else {
        this.handleError(
          `Failed to start sandbox: ${error.message}`,
          "process-spawn",
          safeReject,
        );
      }
    });

    // Monitor stdout for informational messages
    if (this.verbose && process.stdout) {
      process.stdout.on("data", (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`📡 Sandbox: ${output}`);
        }
      });
    }

    // Monitor stderr for errors
    if (process.stderr) {
      process.stderr.on("data", (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          // Always capture stderr for error reporting
          this.stderrBuffer.push(output);

          if (this.verbose) {
            console.log(`🚨 Sandbox error: ${output}`);
          }

          // If the process couldn't bind because something is already running, attach to it and validate version.
          if (
            output.includes("port is already") ||
            output.includes("address already in use") ||
            output.includes("EADDRINUSE")
          ) {
            this.clearManagedTimer("startupTimeout");

            // Clean up our failed spawn process since we'll use external sandbox
            if (this.process) {
              this.process.kill("SIGTERM");
            }
            this.process = null;

            this.tryConnectAndValidateRunningSandbox()
              .then((ok) => {
                if (ok) {
                  console.log("✅ Connected to existing sandbox");
                  safeResolve(this);
                } else {
                  this.handleError(
                    "Port is in use but sandbox is not responsive",
                    "external-sandbox-check",
                    safeReject,
                  );
                }
              })
              .catch((err: any) => {
                this.handleError(
                  err?.message ?? String(err),
                  "external-sandbox-check",
                  safeReject,
                );
              });
          }
        }
      });
    }

    // Handle process exit
    process.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      if (!this.isReady) {
        // Format stderr buffer for error message
        const stderrOutput =
          this.stderrBuffer.length > 0
            ? `\n\nStderr output:\n${this.stderrBuffer.slice(-10).join("\n")}`
            : "";

        if (code === 0) {
          this.handleError(
            `Sandbox process exited unexpectedly${stderrOutput}`,
            "process-exit",
            safeReject,
          );
        } else {
          this.handleError(
            `Sandbox process exited with code ${code} and signal ${signal}${stderrOutput}`,
            "process-exit",
            safeReject,
          );
        }
      }
    });
  }

  async checkSandboxConnectivity(): Promise<void> {
    console.time(`✅ Sandbox ready`);

    const maxRetries = 60; // 60 retries
    const retryDelayMs = 3000; // 3 seconds between retries
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Try to connect to the Aztec node
        const aztecNode = await createAztecNodeClient(this.url, {});

        // Try to get node info to verify it's responsive
        const nodeInfo = await aztecNode.getNodeInfo();

        console.timeEnd(`✅ Sandbox ready`);
        console.log(`🔧 Node version: ${nodeInfo.nodeVersion}`);
        return; // Success!
      } catch (error: any) {
        lastError = error;

        if (attempt < maxRetries) {
          if (this.verbose) {
            console.log(
              `⏳ Sandbox not ready yet (attempt ${attempt}/${maxRetries}), retrying in ${retryDelayMs / 1000}s...`,
            );
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    // If we get here, all retries failed
    throw new Error(
      `Failed to connect to sandbox after ${maxRetries} attempts: ${lastError?.message}`,
    );
  }

  async start(): Promise<SandboxManager> {
    // Validate that we can start
    if (this.isReady || this.process) {
      throw new Error("Cannot start sandbox - already running or starting");
    }

    // If something is already running on the default URL, validate version and reuse it.
    if (await this.tryConnectAndValidateRunningSandbox()) {
      return this;
    }

    return new Promise((resolve, reject) => {
      console.log("🚀 Starting Aztec sandbox");
      let resolved = false; // Prevent double resolution

      const safeResolve = (value: SandboxManager): void => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      const safeReject = (error: Error): void => {
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      };

      // Set up startup timeout
      this.createManagedTimer(
        () => {
          this.cleanup();
          safeReject(
            new Error("❌ Sandbox startup timed out after 180 seconds"),
          );
        },
        this.sandboxTimeout,
        "startupTimeout",
      );

      // Spawn and setup process, then check connectivity
      (async () => {
        try {
          // First spawn the sandbox process
          this.process = await this.spawnSandboxProcess();
          this.setupProcessHandlers(this.process, safeResolve, safeReject);

          // Then wait for it to be ready
          console.log("🔍 Waiting for sandbox to be ready");
          await this.checkSandboxConnectivity();
          this.cleanupTimers();
          this.isExternalSandbox = false; // Mark that we're using our own process
          this.isReady = true;
          console.log("✅ Successfully started our own sandbox process");
          safeResolve(this);
        } catch (error: any) {
          this.handleError(
            `Failed to start sandbox: ${error.message}`,
            "sandbox-start",
            safeReject,
          );
        }
      })();
    });
  }

  /**
   * Logs the current txPublicSetupAllowList and checks if our contracts are whitelisted.
   *
   * Note: The Aztec admin API for updating config at runtime is not publicly exported.
   * To whitelist custom contracts, you must either:
   * 1. Start the sandbox with --sequencer.txPublicSetupAllowList CLI flag (replaces defaults)
   * 2. Set TX_PUBLIC_SETUP_ALLOWLIST environment variable before starting
   *
   * This method is informational - it logs what's currently whitelisted and what we need.
   *
   * @param customClassIds - Optional custom class IDs to check. If not provided, auto-detects from repo contracts.
   * @returns Object containing the current allow list and whether our contracts are whitelisted
   */
  async checkAllowList(customClassIds?: string[]): Promise<{
    currentAllowList: AllowedElement[];
    ourClassIds: string[];
    allWhitelisted: boolean;
    missingClassIds: string[];
  }> {
    if (!this.isReady) {
      throw new Error("Sandbox is not ready. Call start() first.");
    }

    // Step 1: Get current allow list from running node
    const aztecNode = await createAztecNodeClient(this.url, {});
    const currentAllowList = await aztecNode.getAllowedPublicSetup();

    if (this.verbose) {
      console.log(
        `📋 Current allowed setup functions (${currentAllowList.length} entries):`,
      );
      currentAllowList.forEach((elem, i) => {
        if ("classId" in elem) {
          console.log(`   ${i + 1}. classId: ${elem.classId.toString()}`);
        } else if ("address" in elem) {
          console.log(`   ${i + 1}. address: ${elem.address.toString()}`);
        }
      });
    }

    // Step 2: Get our custom contract class IDs
    let classIds: string[] = [];
    if (customClassIds !== undefined) {
      classIds = customClassIds;
    } else if (this.allowedSetupContractClassIds !== undefined) {
      classIds = this.allowedSetupContractClassIds;
    } else {
      // Auto-detect from repo contracts
      classIds = await getContractClassIds();
    }

    if (this.verbose && classIds.length > 0) {
      console.log(`📋 Our contract class IDs (${classIds.length}):`);
      classIds.forEach((id) => {
        console.log(`   - classId: ${id}`);
      });
    }

    // Step 3: Check which of our class IDs are in the current allow list
    const existingClassIds = new Set(
      currentAllowList
        .filter((e) => "classId" in e)
        .map((e) => ("classId" in e ? e.classId.toString() : "")),
    );

    const missingClassIds = classIds.filter((id) => {
      const normalized = id.startsWith("0x") ? id : `0x${id}`;
      // Check both with and without 0x prefix
      return (
        !existingClassIds.has(normalized as `0x${string}`) &&
        !existingClassIds.has(id as `0x${string}` | "")
      );
    });

    const allWhitelisted = missingClassIds.length === 0;

    if (this.verbose) {
      if (allWhitelisted) {
        console.log(`✅ All our contracts are whitelisted!`);
      } else {
        console.log(`⚠️  Missing from whitelist (${missingClassIds.length}):`);
        missingClassIds.forEach((id) => {
          console.log(`   - ${id}`);
        });
      }
    }

    return {
      currentAllowList,
      ourClassIds: classIds,
      allWhitelisted,
      missingClassIds,
    };
  }

  async stop(): Promise<void> {
    // If already stopped, or never got to start just return
    if (!this.isReady && !this.process) {
      return;
    }

    // If using external sandbox, only clean up our state - don't stop external process
    if (this.isExternalSandbox) {
      console.log("🔌 Disconnecting from external sandbox");
      this.resetState();
      return;
    }

    if (!this.process) {
      this.resetState();
      return;
    }

    console.log("🛑 Stopping Aztec sandbox process");

    return new Promise((resolve) => {
      // Set up force kill timeout
      this.createManagedTimer(
        () => {
          if (this.process) {
            console.log("🔥 Force killing sandbox process");
            this.process.kill("SIGKILL");
          }
        },
        this.forceKillTimeout,
        "forceKillTimeout",
      );

      // Listen for process exit
      this.process!.once("exit", () => {
        this.resetState();
        resolve();
      });

      // Send graceful shutdown
      this.process!.kill("SIGTERM");
    });
  }

  cleanup(): void {
    if (this.process) {
      this.process.kill("SIGTERM");
    }

    // Reset all state centrally
    this.resetState();
  }
}

/**
 * Start sandbox and return the manager instance
 */
async function startSandbox(
  options: SandboxManagerOptions = {},
): Promise<SandboxManager> {
  const manager = new SandboxManager(options);
  await manager.start();
  return manager;
}

// This script is designed for Jest testing only - no standalone CLI execution

export { startSandbox, SandboxManager };
