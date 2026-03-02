import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import {
  FunctionCall,
  FunctionSelector,
  FunctionType,
} from "@aztec/stdlib/abi";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";
import { Fr } from "@aztec/foundation/curves/bn254";
import { ProtocolContractAddress } from "@aztec/protocol-contracts";

/**
 * Fee payment method for BridgedFPC that bundles FeeJuice.claim +
 * mint_bridged_and_pay_fee in a single transaction setup phase.
 *
 * Enables cold-start fee sponsorship directly from a L1 bridge deposit,
 * with no prior `mint_bridged` call needed. The caller's wallet only needs to
 * have done the L1 deposit; the L2 claim and wFJ credit happen atomically here.
 *
 * The payment calls (in order):
 *   1. FeeJuice.claim(fpcAddress, amount, secret, leafIndex)
 *      - Consumes the L1→L2 message; emits the FeeJuice nullifier.
 *   2. BridgedFPC.mint_bridged_and_pay_fee(amount, salt, leafIndex)
 *      - Asserts the FeeJuice nullifier exists (pending from step 1).
 *      - Credits (amount - max_gas_cost) to msg_sender.
 *      - Sets BridgedFPC as fee payer and ends setup.
 */
export class BridgedMintAndPayFeePaymentMethod implements FeePaymentMethod {
  constructor(
    private readonly fpcAddress: AztecAddress,
    private readonly amount: bigint,
    private readonly secret: Fr,
    private readonly salt: Fr,
    private readonly leafIndex: Fr,
  ) {}

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for bridged fee payment.");
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.fpcAddress);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    const feeJuiceAddress = ProtocolContractAddress.FeeJuice;

    return new ExecutionPayload(
      [
        FunctionCall.from({
          name: "claim",
          to: feeJuiceAddress,
          selector: await FunctionSelector.fromSignature(
            "claim((Field),u128,Field,Field)",
          ),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [
            this.fpcAddress.toField(),
            new Fr(this.amount),
            this.secret,
            this.leafIndex,
          ],
          returnTypes: [],
        }),
        FunctionCall.from({
          name: "mint_bridged_and_pay_fee",
          to: this.fpcAddress,
          selector: await FunctionSelector.fromSignature(
            "mint_bridged_and_pay_fee(u128,Field,Field)",
          ),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [new Fr(this.amount), this.salt, this.leafIndex],
          returnTypes: [],
        }),
      ],
      [],
      [],
      [],
      this.fpcAddress,
    );
  }

  getGasSettings(): GasSettings | undefined {
    return;
  }
}
