import { AztecAddress } from "@aztec/aztec.js/addresses";
import {
  type AztecAddressLike,
  type ContractArtifact,
  type FieldLike,
} from "@aztec/aztec.js/abi";
import {
  ContractBase,
  ContractFunctionInteraction,
  type ContractMethod,
  type ContractStorageLayout,
  DeployMethod,
} from "@aztec/aztec.js/contracts";
import { PublicKeys } from "@aztec/aztec.js/keys";
import type { Wallet } from "@aztec/aztec.js/wallet";
export declare const MeteredContractArtifact: ContractArtifact;
/**
 * Type-safe interface for contract Metered;
 */
export declare class MeteredContract extends ContractBase {
  private constructor();
  /**
   * Creates a contract instance.
   * @param address - The deployed contract's address.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A new Contract instance.
   */
  static at(address: AztecAddress, wallet: Wallet): MeteredContract;
  /**
   * Creates a tx to deploy a new instance of this contract.
   */
  static deploy(wallet: Wallet): DeployMethod<MeteredContract>;
  /**
   * Creates a tx to deploy a new instance of this contract using the specified public keys hash to derive the address.
   */
  static deployWithPublicKeys(
    publicKeys: PublicKeys,
    wallet: Wallet,
  ): DeployMethod<MeteredContract>;
  /**
   * Creates a tx to deploy a new instance of this contract using the specified constructor method.
   */
  static deployWithOpts<M extends keyof MeteredContract["methods"]>(
    opts: {
      publicKeys?: PublicKeys;
      method?: M;
      wallet: Wallet;
    },
    ...args: Parameters<MeteredContract["methods"][M]>
  ): DeployMethod<MeteredContract>;
  /**
   * Returns this contract's artifact.
   */
  static get artifact(): ContractArtifact;
  /**
   * Returns this contract's artifact with public bytecode.
   */
  static get artifactForPublic(): ContractArtifact;
  static get storage(): ContractStorageLayout<"balances">;
  /** Type-safe wrappers for the public methods exposed by the contract. */
  methods: {
    /** balance_of(account: struct) */
    balance_of: ((account: AztecAddressLike) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** mint(account: struct, amount: integer) */
    mint: ((
      account: AztecAddressLike,
      amount: bigint | number,
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** pay_fee() */
    pay_fee: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** pay_fee_exact() */
    pay_fee_exact: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** process_message(message_ciphertext: struct, message_context: struct) */
    process_message: ((
      message_ciphertext: FieldLike[],
      message_context: {
        tx_hash: FieldLike;
        unique_note_hashes_in_tx: FieldLike[];
        first_nullifier_in_tx: FieldLike;
        recipient: AztecAddressLike;
      },
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** public_dispatch(selector: field) */
    public_dispatch: ((selector: FieldLike) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** sync_private_state() */
    sync_private_state: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
  };
}
//# sourceMappingURL=Metered.d.ts.map
