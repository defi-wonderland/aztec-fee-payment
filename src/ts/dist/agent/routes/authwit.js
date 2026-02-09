import { Router } from "express";
import { invalidInput } from "../errors.js";
import { createValidationMiddleware } from "../middleware/validation.js";
import { authwitRequestSchema } from "../types/index.js";
import { validateTransaction } from "../services/evm/validator.js";
import { verifyClaimRequestSignature } from "../services/crypto/eip712.js";
import { formatAuthwitResponse } from "../services/crypto/authwit.js";
export function createAuthwitRouter(deps) {
  const { config, evmClients, secretGenerator, authwitGenerator, logger } =
    deps;
  const router = Router();
  const validate = createValidationMiddleware(authwitRequestSchema);
  router.post("/authwit/request", validate, async (req, res, next) => {
    const body = req.body;
    const requestId = req.headers["x-request-id"];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aHdpdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL2FnZW50L3JvdXRlcy9hdXRod2l0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFDakMsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUM1QyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN6RSxPQUFPLEVBQ0wsb0JBQW9CLEdBR3JCLE1BQU0sbUJBQW1CLENBQUM7QUFFM0IsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDbkUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFM0UsT0FBTyxFQUVMLHFCQUFxQixHQUN0QixNQUFNLCtCQUErQixDQUFDO0FBV3ZDLE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxJQUFzQjtJQUN4RCxNQUFNLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxFQUFFLEdBQ3JFLElBQUksQ0FBQztJQUNQLE1BQU0sTUFBTSxHQUFHLE1BQU0sRUFBRSxDQUFDO0lBRXhCLE1BQU0sUUFBUSxHQUFHLDBCQUEwQixDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFFbEUsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDakUsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQTBCLENBQUM7UUFDNUMsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQVcsQ0FBQztRQUN4RCxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDO1lBQzdCLFNBQVM7WUFDVCxPQUFPLEVBQUUsSUFBSSxDQUFDLFVB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
