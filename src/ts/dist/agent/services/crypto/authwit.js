import { Fr } from "@aztec/foundation/curves/bn254";
import { GrumpkinScalar } from "@aztec/foundation/curves/grumpkin";
import { Schnorr } from "@aztec/foundation/crypto/schnorr";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  computeInnerAuthWitHash,
  computeOuterAuthWitHash,
} from "@aztec/stdlib/auth-witness";
export class AuthwitGenerator {
  constructor(config) {
    this.fpcAddress = AztecAddress.fromString(config.fpcAddress);
    this.ownerAddress = AztecAddress.fromString(config.ownerAddress);
    this.ownerSigningKey = GrumpkinScalar.fromString(config.ownerSigningKey);
    this.schnorr = new Schnorr();
    this.chainId = new Fr(config.chainId);
    this.version = new Fr(config.version ?? 1n);
  }
  async generateMintAuthwit(amount, secretHex) {
    const amountFr = new Fr(amount);
    const secretFr = new Fr(BigInt(secretHex));
    // Compute inner_hash = H(amount, secret)
    const innerHash = await computeInnerAuthWitHash([amountFr, secretFr]);
    // Compute outer_hash = H(consumer, chainId, version, inner_hash)
    const outerHash = await computeOuterAuthWitHash(
      this.fpcAddress,
      this.chainId,
      this.version,
      innerHash,
    );
    // Sign outer_hash with Schnorr on Grumpkin curve
    const signature = await this.schnorr.constructSignature(
      outerHash.toBuffer(),
      this.ownerSigningKey,
    );
    const witnessFields = signature.toFields();
    return {
      amount,
      secret: secretHex,
      innerHash: innerHash.toString(),
      outerHash: outerHash.toString(),
      witness: witnessFields.map((f) => f.toString()),
    };
  }
}
export function formatAuthwitResponse(authwit) {
  return {
    amount: authwit.amount.toString(),
    secret: authwit.secret,
    authwit: {
      innerHash: authwit.innerHash,
      outerHash: authwit.outerHash,
      witness: authwit.witness,
    },
  };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aHdpdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL2FnZW50L3NlcnZpY2VzL2NyeXB0by9hdXRod2l0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMzRCxPQUFPLEVBQ0wsdUJBQXVCLEVBQ3ZCLHVCQUF1QixHQUN4QixNQUFNLDRCQUE0QixDQUFDO0FBWXBDLE1BQU0sT0FBTyxnQkFBZ0I7SUFRM0IsWUFBWSxNQU1YO1FBQ0MsSUFBSSxDQUFDLFVBQVUsR0FBRyxZQUFZLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2pFLElBQUksQ0FBQyxlQUFlLEdBQUcsY0FBYyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDekUsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzdCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQsS0FBSyxDQUFDLG1CQUFtQixDQUN2QixNQUFjLEVBQ2QsU0FBYztRQUVkLE1BQU0sUUFBUSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2hDLE1BQU0sUUFBUSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBRTNDLHlDQUF5QztRQUN6QyxNQUFNLFNBQVMsR0FBRyxNQUFNLHVCQUF1QixDQUFDLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFFdEUsaUVBQWlFO1FBQ2pFLE1BQU0sU0FBUyxHQUFHLE1BQU0sdUJBQXVCLENBQzdDLElBQUksQ0FBQyxVQUFVLEVBQ2YsSUFBSSxDQUFDLE9BQU8sRUFDWixJQUFJLENBQUMsT0FBTyxFQUNaLFNBQVMsQ0FDVixDQUFDO1FBRUYsaURBQWlEO1FBQ2pELE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FDckQsU0FBUyxDQUFDLFFBQVEsRUFBRSxFQUNwQixJQUFJLENBQUMsZUFBZSxDQUNyQixDQUFDO1FBQ0YsTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRTNDLE9BQU87WUFDTCxNQUFNO1lBQ04sTUFBTSxFQUFFLFNBQVM7WUFDakIsU0FBUyxFQUFFLFNBQVMsQ0FBQyxRQUFRLEVBQUU7WUFDL0IsU0FBUyxFQUFFLFNBQVMsQ0FBQyxRQUFRLEVBQUU7WUFDL0IsT0FBTyxFQUFFLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztTQUNoRCxDQUFDO0lBQ0osQ0FBQztDQUNGO0FBRUQsTUFBTSxVQUFVLHFCQUFxQixDQUFDLE9BQW9CO0lBQ3hELE9BQU87UUFDTCxNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUU7UUFDakMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNO1FBQ3RCLE9BQU8sRUFBRTtZQUNQLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUztZQUM1QixTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVM7WUFDNUIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPO1NBQ3pCO0tBQ0YsQ0FBQztBQUNKLENBQUMifQ==
