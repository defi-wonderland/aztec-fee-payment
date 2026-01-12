import { getContractClassFromArtifact } from "@aztec/stdlib/contract";
import { CounterContractArtifact } from "../src/artifacts/Counter.js";
import { FeePaymentContractArtifact } from "../src/artifacts/FeePayment.js";

/**
 * Computes contract class IDs for all contracts in this repository.
 * These can be used to whitelist contracts for the public setup phase.
 *
 * The public setup phase in Aztec allows contracts to be called during transaction setup.
 * By whitelisting contract class IDs via `--sequencer.txPublicSetupAllowList`, we enable
 * these contracts to be invoked during the setup phase for experimentation.
 *
 * @returns An array of contract class IDs as hex strings (with 0x prefix)
 */
export async function getContractClassIds(): Promise<string[]> {
  const contractClassIds: string[] = [];

  // Compute Counter contract class ID
  try {
    const counterClass = await getContractClassFromArtifact(
      CounterContractArtifact,
    );
    // Keep the 0x prefix - Aztec CLI expects proper hex format
    const classId = counterClass.id.toString();
    contractClassIds.push(classId);
  } catch (error) {
    console.warn("Failed to compute Counter contract class ID:", error);
  }

  // Compute FeePayment contract class ID
  try {
    const feePaymentClass = await getContractClassFromArtifact(
      FeePaymentContractArtifact,
    );
    // Keep the 0x prefix - Aztec CLI expects proper hex format
    const classId = feePaymentClass.id.toString();
    contractClassIds.push(classId);
  } catch (error) {
    console.warn("Failed to compute FeePayment contract class ID:", error);
  }

  return contractClassIds;
}

/**
 * Gets contract class IDs as a comma-separated string for CLI usage
 */
export async function getContractClassIdsAsString(): Promise<string> {
  const ids = await getContractClassIds();
  return ids.join(",");
}
