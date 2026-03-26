import { Fr } from "@aztec/aztec.js/fields";
import { Wallet } from "@aztec/aztec.js/wallet";
import { AztecAddress } from "@aztec/stdlib/aztec-address";

import { PrivateFPCContract } from "../../artifacts/PrivateFPC.js";

/**
 * Registers the PrivateFPC contract with the PXE without sending any deployment transaction.
 *
 * PrivateFPC is a fully private contract (no public functions, no constructor, no initializer).
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
 * @param salt   Salt used to derive the contract address
 * @returns The registered PrivateFPC contract instance
 */
export async function registerPrivateContract(
  wallet: Wallet,
  salt: Fr,
): Promise<PrivateFPCContract> {
  return PrivateFPCContract.deploy(wallet).register({
    contractAddressSalt: salt,
    skipInitialization: true,
    deployer: AztecAddress.ZERO,
  });
}
