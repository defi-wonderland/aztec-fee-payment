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
import { verifyClaimRequestSignature } from "../services/crypto/eip712.js";
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

      // 2. Validate the EVM transaction
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

      // 3. Verify EIP-712 signature matches transaction sender
      let signatureValid: boolean;
      try {
        signatureValid = await verifyClaimRequestSignature(
          { txHash: evmTxHash },
          signature as Hex,
          txResult.transaction!.from as Address,
          evmChainId,
        );
      } catch (error) {
        requestLogger.warn(
          { error },
          "Failed to verify claim request signature",
        );
        throw new AppError(
          "INVALID_SIGNATURE",
          "Failed to verify claim request signature",
        );
      }

      if (!signatureValid) {
        requestLogger.warn(
          { txSender: txResult.transaction!.from },
          "Signature does not match transaction sender",
        );
        throw new AppError(
          "INVALID_SIGNATURE",
          "Signature does not match transaction sender",
        );
      }

      // 4. Generate deterministic secret (includes chainId to prevent cross-chain replay)
      const secret = secretGenerator.generateSecret(
        evmTxHash as Hex,
        evmChainId,
      );
      requestLogger.debug("Generated deterministic secret");

      // 5. Generate authwit
      const authwit = await authwitGenerator.generateMintAuthwit(
        txResult.transaction!.amount,
        secret,
      );
      requestLogger.info(
        { amount: txResult.transaction!.amount.toString() },
        "Generated authwit successfully",
      );

      // 6. Return response
      const response: AuthwitResponse = formatAuthwitResponse(authwit);
      return reply.status(200).send(response);
    },
  );
}
