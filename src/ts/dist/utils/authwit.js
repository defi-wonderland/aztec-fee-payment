/**
 * Create an authorization witness for MeteredToken fee payment.
 * This authwit allows the FPC to transfer tokens from the user's account.
 * Use with MeteredTokenFeePaymentMethod (no refunds).
 */
export async function createMeteredTokenAuthWitness(args) {
  const action = args.token
    .withWallet(args.wallet)
    .methods.transfer_to_public(
      args.from,
      args.fpcAddress,
      args.amount,
      args.nonce,
    );
  const intent = { caller: args.fpcAddress, action };
  return await args.wallet.createAuthWit(args.from, intent);
}
/**
 * Create an authorization witness for MeteredToken exact fee payment.
 * This authwit allows the FPC to transfer tokens and prepare a refund.
 * Use with MeteredTokenExactFeePaymentMethod (with refunds in teardown).
 */
export async function createMeteredTokenExactAuthWitness(args) {
  const action = args.token
    .withWallet(args.wallet)
    .methods.transfer_to_public_and_prepare_private_balance_increase(
      args.from,
      args.fpcAddress,
      args.amount,
      args.nonce,
    );
  const intent = { caller: args.fpcAddress, action };
  return await args.wallet.createAuthWit(args.from, intent);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aHdpdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3V0aWxzL2F1dGh3aXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBS0E7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsNkJBQTZCLENBQUMsSUFPbkQ7SUFDQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSztTQUN0QixVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztTQUN2QixPQUFPLENBQUMsa0JBQWtCLENBQ3pCLElBQUksQ0FBQyxJQUFJLEVBQ1QsSUFBSSxDQUFDLFVBQVUsRUFDZixJQUFJLENBQUMsTUFBTSxFQUNYLElBQUksQ0FBQyxLQUFLLENBQ1gsQ0FBQztJQUVKLE1BQU0sTUFBTSxHQUFHLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFLENBQUM7SUFDbkQsT0FBTyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDNUQsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLGtDQUFrQyxDQUFDLElBT3hEO0lBQ0MsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUs7U0FDdEIsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7U0FDdkIsT0FBTyxDQUFDLHVEQUF1RCxDQUM5RCxJQUFJLENBQUMsSUFBSSxFQUNULElBQUksQ0FBQyxVQUFVLEVBQ2YsSUFBSSxDQUFDLE1BQU0sRUFDWCxJQUFJLENBQUMsS0FBSyxDQUNYLENBQUM7SUFFSixNQUFNLE1BQU0sR0FBRyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLE1BQU0sRUFBRSxDQUFDO0lBQ25ELE9BQU8sTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQzVELENBQUMifQ==
