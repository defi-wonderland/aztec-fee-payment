import {
  MeteredTokenSponsoredFeePaymentMethod,
  MeteredExactTokenSponsoredFeePaymentMethod,
  TeardownRevertTokenSponsoredFeePaymentMethod,
} from "../fee-payment-methods/token.js";
/**
 * Build a token-based fee payment method.
 * @param args - Configuration for the payment method
 * @returns A FeePaymentMethod instance for the specified kind
 */
export function buildTokenSponsoredFeePaymentMethod(args) {
  switch (args.kind) {
    case "metered":
      return new MeteredTokenSponsoredFeePaymentMethod(
        args.feePayer,
        args.tokenAddress,
        args.nonce,
      );
    case "metered_exact":
      return new MeteredExactTokenSponsoredFeePaymentMethod(
        args.feePayer,
        args.tokenAddress,
        args.nonce,
      );
    case "teardown_revert_metered":
      return new TeardownRevertTokenSponsoredFeePaymentMethod(
        args.feePayer,
        args.tokenAddress,
        args.nonce,
      );
  }
}
/**
 * Build the token transfer action for authwit creation.
 * @param args - Configuration for the transfer
 * @returns A ContractFunctionInteraction or undefined for kinds that don't need authwit
 */
export function buildTokenSponsorshipTransferAction(args) {
  const tokenWithWallet = args.token.withWallet(args.wallet);
  switch (args.kind) {
    case "metered":
      return tokenWithWallet.methods.transfer_to_public(
        args.from,
        args.to,
        args.amount,
        args.nonce,
      );
    case "metered_exact":
      return tokenWithWallet.methods.transfer_to_public_and_prepare_private_balance_increase(
        args.from,
        args.to,
        args.amount,
        args.nonce,
      );
  }
}
/**
 * Create an authorization witness for token-based fee sponsorship.
 * This authwit allows the FPC to transfer tokens from the user's account.
 * @param args - Configuration for the authwit
 * @returns An AuthWitness that authorizes the token transfer
 */
export async function createTokenSponsorshipAuthWitness(args) {
  const action = buildTokenSponsorshipTransferAction({
    kind: args.kind,
    token: args.token,
    wallet: args.wallet,
    from: args.from,
    to: args.feePayer,
    amount: args.amount,
    nonce: args.nonce,
  });
  if (!action) {
    throw new Error(`No authwit action required for kind: ${args.kind}`);
  }
  const intent = { caller: args.feePayer, action };
  return await args.wallet.createAuthWit(args.from, intent);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aHdpdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3V0aWxzL2F1dGh3aXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBT0EsT0FBTyxFQUNMLHFDQUFxQyxFQUNyQywwQ0FBMEMsRUFDMUMsNENBQTRDLEdBQzdDLE1BQU0saUNBQWlDLENBQUM7QUFVekM7Ozs7R0FJRztBQUNILE1BQU0sVUFBVSxtQ0FBbUMsQ0FBQyxJQUtuRDtJQUNDLFFBQVEsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xCLEtBQUssU0FBUztZQUNaLE9BQU8sSUFBSSxxQ0FBcUMsQ0FDOUMsSUFBSSxDQUFDLFFBQVEsRUFDYixJQUFJLENBQUMsWUFBWSxFQUNqQixJQUFJLENBQUMsS0FBSyxDQUNYLENBQUM7UUFDSixLQUFLLGVBQWU7WUFDbEIsT0FBTyxJQUFJLDBDQUEwQyxDQUNuRCxJQUFJLENBQUMsUUFBUSxFQUNiLElBQUksQ0FBQyxZQUFZLEVBQ2pCLElBQUksQ0FBQyxLQUFLLENBQ1gsQ0FBQztRQUNKLEtBQUsseUJBQXlCO1lBQzVCLE9BQU8sSUFBSSw0Q0FBNEMsQ0FDckQsSUFBSSxDQUFDLFFBQVEsRUFDYixJQUFJLENBQUMsWUFBWSxFQUNqQixJQUFJLENBQUMsS0FBSyxDQUNYLENBQUM7SUFDTixDQUFDO0FBQ0gsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUsbUNBQW1DLENBQUMsSUFRbkQ7SUFDQyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0QsUUFBUSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbEIsS0FBSyxTQUFTO1lBQ1osT0FBTyxlQUFlLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUMvQyxJQUFJLENBQUMsSUFBSSxFQUNULElBQUksQ0FBQyxFQUFFLEVBQ1AsSUFBSSxDQUFDLE1BQU0sRUFDWCxJQUFJLENBQUMsS0FBSyxDQUNYLENBQUM7UUFDSixLQUFLLGVBQWU7WUFDbEIsT0FBTyxlQUFlLENBQUMsT0FBTyxDQUFDLHVEQUF1RCxDQUNwRixJQUFJLENBQUMsSUFBSSxFQUNULElBQUksQ0FBQyxFQUFFLEVBQ1AsSUFBSSxDQUFDLE1BQU0sRUFDWCxJQUFJLENBQUMsS0FBSyxDQUNYLENBQUM7SUFDTixDQUFDO0FBQ0gsQ0FBQztBQUVEOzs7OztHQUtHO0FBQ0gsTUFBTSxDQUFDLEtBQUssVUFBVSxpQ0FBaUMsQ0FBQyxJQVF2RDtJQUNDLE1BQU0sTUFBTSxHQUFHLG1DQUFtQyxDQUFDO1FBQ2pELElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtRQUNmLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztRQUNqQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07UUFDbkIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1FBQ2YsRUFBRSxFQUFFLElBQUksQ0FBQyxRQUFRO1FBQ2pCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtRQUNuQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7S0FDbEIsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyx3Q0FBd0MsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUVELE1BQU0sTUFBTSxHQUFHLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLENBQUM7SUFDakQsT0FBTyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDNUQsQ0FBQyJ9
