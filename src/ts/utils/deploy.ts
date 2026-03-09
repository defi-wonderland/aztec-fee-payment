import { Fr } from "@aztec/foundation/curves/bn254";
import { Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/aztec.js/addresses";

import { BridgedFPCContract } from "../../artifacts/BridgedFPC.js";

/**
 * Registers the BridgedFPC contract with the PXE without sending any deployment transaction.
 *
 * BridgedFPC is a fully private contract (no public functions, no constructor, no initializer).
 * The Aztec protocol allows interacting with such contracts immediately once registered —
 * no on-chain deployment transaction is required.
 *
 * The contract address is computed deterministically from its class hash and the provided salt,
 * with `deployer: AztecAddress.ZERO` so the deployer address is NOT mixed in. This means the same
 * salt always produces the same address regardless of who calls this function.
 * (`universalDeploy` is only available on `.send()` options; for `.register()` the equivalent
 * is setting `deployer` to `AztecAddress.ZERO`.)
 *
 * @param wallet The wallet used to register the contract with the PXE
 * @param salt   Optional address salt (defaults to Fr.ZERO for a canonical address)
 * @returns The registered BridgedFPC contract instance
 */
export async function registerBridgedContract(
  wallet: Wallet,
  salt: Fr = Fr.ZERO,
): Promise<BridgedFPCContract> {
  return BridgedFPCContract.deploy(wallet).register({
    contractAddressSalt: salt,
    skipInitialization: true,
    deployer: AztecAddress.ZERO,
  });
}
