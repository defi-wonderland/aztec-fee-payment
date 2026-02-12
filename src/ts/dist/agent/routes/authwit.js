import { Router } from "express";
import { invalidInput } from "../errors.js";
import { createValidationMiddleware } from "../middleware/validation.js";
import { authwitRequestSchema } from "../types/index.js";
import { validateTransaction } from "../services/evm/validator.js";
import { recoverClaimRequestSigner } from "../services/crypto/eip712.js";
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
      // 2. Recover sender from EIP-712 signature
      reqLogger.info("Recovering EIP-712 signer");
      let from;
      try {
        from = await recoverClaimRequestSigner(
          { txHash: body.evmTxHash },
          body.signature,
          body.evmChainId,
        );
      } catch {
        throw invalidInput(
          "INVALID_SIGNATURE",
          "Could not recover signer from EIP-712 signature",
        );
      }
      // 3. Validate EVM transaction (throws AppError on failure)
      reqLogger.info("Validating EVM transaction");
      const txResult = await validateTransaction({
        client,
        txHash: body.evmTxHash,
        from,
        feeCollectorAddress: chainConfig.feeCollectorAddress,
        aztTokenAddress: chainConfig.aztTokenAddress,
        requiredConfirmations: chainConfig.requiredConfirmations,
        minAmount: config.minAmount,
        logger: reqLogger,
      });
      // 4. Generate deterministic secret from txHash + sender
      const secret = secretGenerator.generateSecret(body.evmTxHash, from);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aHdpdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL2FnZW50L3JvdXRlcy9hdXRod2l0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFDakMsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUM1QyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN6RSxPQUFPLEVBQ0wsb0JBQW9CLEdBR3JCLE1BQU0sbUJBQW1CLENBQUM7QUFFM0IsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDbkUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFekUsT0FBTyxFQUVMLHFCQUFxQixHQUN0QixNQUFNLCtCQUErQixDQUFDO0FBV3ZDLE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxJQUFzQjtJQUN4RCxNQUFNLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxFQUFFLEdBQ3JFLElBQUksQ0FBQztJQUNQLE1BQU0sTUFBTSxHQUFHLE1BQU0sRUFBRSxDQUFDO0lBRXhCLE1BQU0sUUFBUSxHQUFHLDBCQUEwQixDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFFbEUsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDakUsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQTBCLENBQUM7UUFDNUMsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQVcsQ0FBQztRQUN4RCxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDO1lBQzdCLFNBQVM7WUFDVCxPQUFPLEVBQUUsSUFBSSxDQUFDLFVBQVU7WUFDeEIsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTO1NBQ3ZCLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQztZQUNILGlDQUFpQztZQUNqQyxNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNuRCxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzdELElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDNUIsTUFBTSxZQUFZLENBQ2hCLGVBQWUsRUFDZixZQUFZLElBQUksQ0FBQyxVQUFVLG1CQUFtQixFQUM5QyxFQUFFLGVBQWUsRUFBRSxVQUFVLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxDQUNyRCxDQUFDO1lBQ0osQ0FBQztZQUVELDJDQUEyQztZQUMzQyxTQUFTLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFDNUMsSUFBSSxJQUFJLENBQUM7WUFDVCxJQUFJLENBQUM7Z0JBQ0gsSUFBSSxHQUFHLE1BQU0seUJBQXlCLENBQ3BDLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsRUFDMUIsSUFBSSxDQUFDLFNBQVMsRUFDZCxJQUFJLENBQUMsVUFBVSxDQUNoQixDQUFDO1lBQ0osQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUCxNQUFNLFlBQVksQ0FDaEIsbUJBQW1CLEVBQ25CLGlEQUFpRCxDQUNsRCxDQUFDO1lBQ0osQ0FBQztZQUVELDJEQUEyRDtZQUMzRCxTQUFTLENBQUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLENBQUM7WUFDN0MsTUFBTSxRQUFRLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQztnQkFDekMsTUFBTTtnQkFDTixNQUFNLEVBQUUsSUFBSSxDQUFDLFNBQVM7Z0JBQ3RCLElBQUk7Z0JBQ0osbUJBQW1CLEVBQUUsV0FBVyxDQUFDLG1CQUFtQjtnQkFDcEQsZUFBZSxFQUFFLFdBQVcsQ0FBQyxlQUFlO2dCQUM1QyxxQkFBcUIsRUFBRSxXQUFXLENBQUMscUJBQXFCO2dCQUN4RCxTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVM7Z0JBQzNCLE1BQU0sRUFBRSxTQUFTO2FBQ2xCLENBQUMsQ0FBQztZQUVILHdEQUF3RDtZQUN4RCxNQUFNLE1BQU0sR0FBRyxlQUFlLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFcEUsc0JBQXNCO1lBQ3RCLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztZQUNyQyxNQUFNLE9BQU8sR0FBRyxNQUFNLGdCQUFnQixDQUFDLG1CQUFtQixDQUN4RCxRQUFRLENBQUMsTUFBTSxFQUNmLE1BQU0sQ0FDUCxDQUFDO1lBRUYscUJBQXFCO1lBQ3JCLFNBQVMsQ0FBQyxJQUFJLENBQ1osRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRSxFQUN0QyxtQkFBbUIsQ0FDcEIsQ0FBQztZQUNGLEdBQUcsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUMzQyxDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNiLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNaLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILE9BQU8sTUFBTSxDQUFDO0FBQ2hCLENBQUMifQ==
