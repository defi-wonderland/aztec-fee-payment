/**
 * Authwit Request Routes
 *
 * Handles POST /api/v1/authwit/request endpoint for generating authwits.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Hex, Address } from "viem";
import { authwitRequestSchema } from "../config/schema.js";
import { createValidationPreHandler } from "../middleware/validation.js";
import { AppError } from "../middleware/errorHandler.js";
import type { Logger } from "../middleware/logger.js";
import type {
  AgentConfig,
  AuthwitRequestBody,
  AuthwitResponse,
} from "../types/index.js";
import {
  MultiChainEVMClient,
  validateTransaction,
} from "../services/evm/index.js";
import { recoverClaimRequestSigner } from "../services/crypto/eip712.js";
import { SecretGenerator } from "../services/crypto/secret.js";
import {
  AuthwitGenerator,
  formatAuthwitResponse,
} from "../services/crypto/authwit.js";

interface AuthwitRouteContext {
  config: AgentConfig;
  logger: Logger;
  evmClients: MultiChainEVMClient;
  secretGenerator: SecretGenerator;
  authwitGenerator: AuthwitGenerator;
}

/**
 * Register authwit routes
 */
export async function registerAuthwitRoutes(
  app: FastifyInstance,
  context: AuthwitRouteContext,
) {
  const { config, logger, evmClients, secretGenerator, authwitGenerator } =
    context;

  /**
   * POST /authwit/request
   *
   * Generate an authwit for minting wFJ on Aztec after EVM payment.
   */
  app.post<{ Body: AuthwitRequestBody }>(
    "/authwit/request",
    {
      preHandler: createValidationPreHandler(authwitRequestSchema),
    },
    async (
      request: FastifyRequest<{ Body: AuthwitRequestBody }>,
      reply: FastifyReply,
    ) => {
      const { evmTxHash, evmChainId, signature } = request.body;
      const requestLogger = logger.child({
        requestId: (request as any).id,
        txHash: evmTxHash,
        chainId: evmChainId,
      });

      requestLogger.info("Processing authwit request");

      // 1. Validate chain is supported
      if (!evmClients.isChainSupported(evmChainId)) {
        throw new AppError(
          "INVALID_CHAIN",
          `Chain ${evmChainId} is not supported`,
          { supportedChains: evmClients.getSupportedChains() },
        );
      }

      const chainConfig = config.chains[evmChainId];
      const client = evmClients.getClientForChain(evmChainId);
      if (!client) {
        throw new AppError(
          "INVALID_CHAIN",
          `No client available for chain ${evmChainId}`,
        );
      }

      // 2. Verify EIP-712 signature and recover signer
      let signer: Address;
      try {
        signer = await recoverClaimRequestSigner(
          { txHash: evmTxHash },
          signature as Hex,
          evmChainId,
        );
        requestLogger.debug({ signer }, "Recovered signer from signature");
      } catch (error) {
        requestLogger.warn(
          { error },
          "Failed to recover signer from signature",
        );
        throw new AppError(
          "INVALID_SIGNATURE",
          "Failed to recover signer from signature",
        );
      }

      // 3. Validate the EVM transaction
      const txResult = await validateTransaction({
        client,
        txHash: evmTxHash as Hex,
        feeCollectorAddress: chainConfig.feeCollectorAddress,
        aztTokenAddress: chainConfig.aztTokenAddress,
        requiredConfirmations: chainConfig.requiredConfirmations,
        logger: requestLogger,
      });

      if (!txResult.valid) {
        throw new AppError(
          txResult.error!,
          txResult.errorMessage || "Transaction validation failed",
        );
      }

      // 4. Validate that signer matches transaction sender
      if (signer.toLowerCase() !== txResult.transaction!.from.toLowerCase()) {
        // Log details server-side for debugging, but don't expose in response
        requestLogger.warn(
          { signer, txSender: txResult.transaction!.from },
          "Signer does not match transaction sender",
        );
        throw new AppError(
          "INVALID_SIGNATURE",
          "Signer does not match transaction sender",
        );
      }

      // 5. Generate deterministic secret (includes chainId to prevent cross-chain replay)
      const secret = secretGenerator.generateSecret(
        evmTxHash as Hex,
        evmChainId,
      );
      requestLogger.debug("Generated deterministic secret");

      // 6. Generate authwit
      const authwit = await authwitGenerator.generateMintAuthwit(
        txResult.transaction!.amount,
        secret,
      );
      requestLogger.info(
        { amount: txResult.transaction!.amount.toString() },
        "Generated authwit successfully",
      );

      // 7. Return response
      const response: AuthwitResponse = formatAuthwitResponse(authwit);
      return reply.status(200).send(response);
    },
  );
}
