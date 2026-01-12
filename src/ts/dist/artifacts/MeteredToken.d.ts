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
export declare const MeteredTokenContractArtifact: ContractArtifact;
/**
 * Type-safe interface for contract MeteredToken;
 */
export declare class MeteredTokenContract extends ContractBase {
  private constructor();
  /**
   * Creates a contract instance.
   * @param address - The deployed contract's address.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A new Contract instance.
   */
  static at(address: AztecAddress, wallet: Wallet): MeteredTokenContract;
  /**
   * Creates a tx to deploy a new instance of this contract.
   */
  static deploy(
    wallet: Wallet,
    token_address: AztecAddressLike,
  ): DeployMethod<MeteredTokenContract>;
  /**
   * Creates a tx to deploy a new instance of this contract using the specified public keys hash to derive the address.
   */
  static deployWithPublicKeys(
    publicKeys: PublicKeys,
    wallet: Wallet,
    token_address: AztecAddressLike,
  ): DeployMethod<MeteredTokenContract>;
  /**
   * Creates a tx to deploy a new instance of this contract using the specified constructor method.
   */
  static deployWithOpts<M extends keyof MeteredTokenContract["methods"]>(
    opts: {
      publicKeys?: PublicKeys;
      method?: M;
      wallet: Wallet;
    },
    ...args: Parameters<MeteredTokenContract["methods"][M]>
  ): DeployMethod<MeteredTokenContract>;
  /**
   * Returns this contract's artifact.
   */
  static get artifact(): ContractArtifact;
  /**
   * Returns this contract's artifact with public bytecode.
   */
  static get artifactForPublic(): ContractArtifact;
  static get storage(): ContractStorageLayout<"token">;
  /** Type-safe wrappers for the public methods exposed by the contract. */
  methods: {
    /** constructor(token_address: struct) */
    constructor: ((
      token_address: AztecAddressLike,
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** get_token() */
    get_token: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** pay_fee(nonce: field) */
    pay_fee: ((nonce: FieldLike) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** pay_fee_exact(nonce: field) */
    pay_fee_exact: ((nonce: FieldLike) => ContractFunctionInteraction) &
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
//# sourceMappingURL=MeteredToken.d.ts.map
