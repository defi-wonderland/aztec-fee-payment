import { Router } from "express";
import { invalidInput } from "../errors.js";
import { createValidationMiddleware } from "../middleware/validation.js";
import {
  authwitRequestSchema,
  type AgentConfig,
  type AuthwitRequestBody,
} from "../types/index.js";
import { MultiChainEVMClient } from "../services/evm/client.js";
import { validateTransaction } from "../services/evm/validator.js";
import { verifyClaimRequestSignature } from "../services/crypto/eip712.js";
import { SecretGenerator } from "../services/crypto/secret.js";
import {
  AuthwitGenerator,
  formatAuthwitResponse,
} from "../services/crypto/authwit.js";
import type { Logger } from "../middleware/logger.js";

export interface AuthwitRouteDeps {
  config: AgentConfig;
  evmClients: MultiChainEVMClient;
  secretGenerator: SecretGenerator;
  authwitGenerator: AuthwitGenerator;
  logger: Logger;
}

export function createAuthwitRouter(deps: AuthwitRouteDeps): Router {
  const { config, evmClients, secretGenerator, authwitGenerator, logger } =
    deps;
  const router = Router();

  const validate = createValidationMiddleware(authwitRequestSchema);

  router.post("/authwit/request", validate, async (req, res, next) => {
    const body = req.body as AuthwitRequestBody;
    const requestId = req.headers["x-request-id"] as string;
    const reqLogger = logger.child({
      requestId,
      chainId: body.evmChainId,
      txHash: body.evmTxHash,
    });

    try {
      // 1. Validate chain is supported
      const chainConfig = config.chains[body.evmChainId];
      const client = evmClients.getClientForChain(body.evmChainId);
      if (!client || !chainConfig) {
        throw invalidInput(
          "INVALID_CHAIN",
          `Chain ID ${body.evmChainId} is not supported`,
          { supportedChains: evmClients.getSupportedChains() },
        );
      }

      // 2. Validate EVM transaction (throws AppError on failure)
      reqLogger.info("Validating EVM transaction");
      const txResult = await validateTransaction({
        client,
        txHash: body.evmTxHash,
        feeCollectorAddress: chainConfig.feeCollectorAddress,
        aztTokenAddress: chainConfig.aztTokenAddress,
        requiredConfirmations: chainConfig.requiredConfirmations,
        minAmount: config.minAmount,
        logger: reqLogger,
      });

      // 3. Verify EIP-712 signature matches tx sender
      reqLogger.info("Verifying EIP-712 signature");
      const signatureValid = await verifyClaimRequestSignature(
        { txHash: body.evmTxHash },
        body.signature,
        txResult.from,
        body.evmChainId,
      );

      if (!signatureValid) {
        throw invalidInput(
          "INVALID_SIGNATURE",
          "EIP-712 signature is invalid or signer does not match transaction sender",
        );
      }

      // 4. Generate deterministic secret from txHash
      const secret = secretGenerator.generateSecret(body.evmTxHash);

      // 5. Generate authwit
      reqLogger.info("Generating authwit");
      const authwit = await authwitGenerator.generateMintAuthwit(
        txResult.amount,
        secret,
      );

      // 6. Return response
      reqLogger.info(
        { amount: txResult.amount.toString() },
        "Authwit generated",
      );
      res.json(formatAuthwitResponse(authwit));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
