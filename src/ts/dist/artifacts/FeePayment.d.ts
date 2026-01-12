import { AztecAddress } from "@aztec/aztec.js/addresses";
import {
  type AztecAddressLike,
  type ContractArtifact,
  type FieldLike,
  type WrappedFieldLike,
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
export declare const FeePaymentContractArtifact: ContractArtifact;
/**
 * Type-safe interface for contract FeePayment;
 */
export declare class FeePaymentContract extends ContractBase {
  private constructor();
  /**
   * Creates a contract instance.
   * @param address - The deployed contract's address.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A new Contract instance.
   */
  static at(address: AztecAddress, wallet: Wallet): FeePaymentContract;
  /**
   * Creates a tx to deploy a new instance of this contract.
   */
  static deploy(wallet: Wallet): DeployMethod<FeePaymentContract>;
  /**
   * Creates a tx to deploy a new instance of this contract using the specified public keys hash to derive the address.
   */
  static deployWithPublicKeys(
    publicKeys: PublicKeys,
    wallet: Wallet,
  ): DeployMethod<FeePaymentContract>;
  /**
   * Creates a tx to deploy a new instance of this contract using the specified constructor method.
   */
  static deployWithOpts<M extends keyof FeePaymentContract["methods"]>(
    opts: {
      publicKeys?: PublicKeys;
      method?: M;
      wallet: Wallet;
    },
    ...args: Parameters<FeePaymentContract["methods"][M]>
  ): DeployMethod<FeePaymentContract>;
  /**
   * Returns this contract's artifact.
   */
  static get artifact(): ContractArtifact;
  /**
   * Returns this contract's artifact with public bytecode.
   */
  static get artifactForPublic(): ContractArtifact;
  static get storage(): ContractStorageLayout<"fee_juice_balance">;
  /** Type-safe wrappers for the public methods exposed by the contract. */
  methods: {
    /** get_fee_juice_balance(account: struct) */
    get_fee_juice_balance: ((
      account: AztecAddressLike,
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** mint_fee_juice(account: struct, amount: integer) */
    mint_fee_juice: ((
      account: AztecAddressLike,
      amount: bigint | number,
    ) => ContractFunctionInteraction) &
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
    /** sponsor_for_class_id(expected_class_id: struct) */
    sponsor_for_class_id: ((
      expected_class_id: WrappedFieldLike,
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** sponsor_metered() */
    sponsor_metered: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** sponsor_metered_exact() */
    sponsor_metered_exact: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** sponsor_metered_teardown_revert() */
    sponsor_metered_teardown_revert: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** sponsor_metered_token(token_address: struct, nonce: field) */
    sponsor_metered_token: ((
      token_address: AztecAddressLike,
      nonce: FieldLike,
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** sponsor_metered_token_exact(token_address: struct, nonce: field) */
    sponsor_metered_token_exact: ((
      token_address: AztecAddressLike,
      nonce: FieldLike,
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** sponsor_metered_token_teardown_revert(token_address: struct, nonce: field) */
    sponsor_metered_token_teardown_revert: ((
      token_address: AztecAddressLike,
      nonce: FieldLike,
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** sponsor_unconditionally() */
    sponsor_unconditionally: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** sponsor_unconditionally_teardown_revert() */
    sponsor_unconditionally_teardown_revert: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
    /** sync_private_state() */
    sync_private_state: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
  };
}
//# sourceMappingURL=FeePayment.d.ts.map
