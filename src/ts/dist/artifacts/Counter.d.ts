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
export declare const CounterContractArtifact: ContractArtifact;
/**
 * Type-safe interface for contract Counter;
 */
export declare class CounterContract extends ContractBase {
  private constructor();
  /**
   * Creates a contract instance.
   * @param address - The deployed contract's address.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A new Contract instance.
   */
  static at(address: AztecAddress, wallet: Wallet): CounterContract;
  /**
   * Creates a tx to deploy a new instance of this contract.
   */
  static deploy(wallet: Wallet): DeployMethod<CounterContract>;
  /**
   * Creates a tx to deploy a new instance of this contract using the specified public keys hash to derive the address.
   */
  static deployWithPublicKeys(
    publicKeys: PublicKeys,
    wallet: Wallet,
  ): DeployMethod<CounterContract>;
  /**
   * Creates a tx to deploy a new instance of this contract using the specified constructor method.
   */
  static deployWithOpts<M extends keyof CounterContract["methods"]>(
    opts: {
      publicKeys?: PublicKeys;
      method?: M;
      wallet: Wallet;
    },
    ...args: Parameters<CounterContract["methods"][M]>
  ): DeployMethod<CounterContract>;
  /**
   * Returns this contract's artifact.
   */
  static get artifact(): ContractArtifact;
  /**
   * Returns this contract's artifact with public bytecode.
   */
  static get artifactForPublic(): ContractArtifact;
  static get storage(): ContractStorageLayout<"counter">;
  /** Type-safe wrappers for the public methods exposed by the contract. */
  methods: {
    /** get_counter() */
    get_counter: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** increment() */
    increment: (() => ContractFunctionInteraction) &
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
    /** sync_state() */
    sync_state: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
  };
}
//# sourceMappingURL=Counter.d.ts.map
