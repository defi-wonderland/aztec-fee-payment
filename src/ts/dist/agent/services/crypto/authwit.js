import { Fr } from "@aztec/foundation/curves/bn254";
import { GrumpkinScalar } from "@aztec/foundation/curves/grumpkin";
import { Schnorr } from "@aztec/foundation/crypto/schnorr";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { computeInnerAuthWitHash, computeOuterAuthWitHash, } from "@aztec/stdlib/auth-witness";
export class AuthwitGenerator {
    constructor(config) {
        this.fpcAddress = AztecAddress.fromString(config.fpcAddress);
        this.ownerAddress = AztecAddress.fromString(config.ownerAddress);
        this.ownerSigningKey = GrumpkinScalar.fromString(config.ownerSigningKey);
        this.schnorr = new Schnorr();
        this.chainId = new Fr(config.chainId ?? 0n);
        this.version = new Fr(config.version ?? 1n);
    }
    async generateMintAuthwit(amount, secretHex) {
        const amountFr = new Fr(amount);
        const secretFr = new Fr(BigInt(secretHex));
        // Compute inner_hash = H(amount, secret)
        const innerHash = await computeInnerAuthWitHash([amountFr, secretFr]);
        // Compute outer_hash = H(consumer, chainId, version, inner_hash)
        const outerHash = await computeOuterAuthWitHash(this.fpcAddress, this.chainId, this.version, innerHash);
        // Sign outer_hash with Schnorr on Grumpkin curve
        const signature = await this.schnorr.constructSignature(outerHash.toBuffer(), this.ownerSigningKey);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aHdpdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL2FnZW50L3NlcnZpY2VzL2NyeXB0by9hdXRod2l0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMzRCxPQUFPLEVBQ0wsdUJBQXVCLEVBQ3ZCLHVCQUF1QixHQUN4QixNQUFNLDRCQUE0QixDQUFDO0FBWXBDLE1BQU0sT0FBTyxnQkFBZ0I7SUFRM0IsWUFBWSxNQU1YO1FBQ0MsSUFBSSxDQUFDLFVBQVUsR0FBRyxZQUFZLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2pFLElBQUksQ0FBQyxlQUFlLEdBQUcsY0FBYyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDekUsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBQzdCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUIsQ0FDdkIsTUFBYyxFQUNkLFNBQWM7UUFFZCxNQUFNLFFBQVEsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNoQyxNQUFNLFFBQVEsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUUzQyx5Q0FBeUM7UUFDekMsTUFBTSxTQUFTLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBRXRFLGlFQUFpRTtRQUNqRSxNQUFNLFNBQVMsR0FBRyxNQUFNLHVCQUF1QixDQUM3QyxJQUFJLENBQUMsVUFBVSxFQUNmLElBQUksQ0FBQyxPQUFPLEVBQ1osSUFBSSxDQUFDLE9BQU8sRUFDWixTQUFTLENBQ1YsQ0FBQztRQUVGLGlEQUFpRDtRQUNqRCxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQ3JELFNBQVMsQ0FBQyxRQUFRLEVBQUUsRUFDcEIsSUFBSSxDQUFDLGVBQWUsQ0FDckIsQ0FBQztRQUNGLE1BQU0sYUFBYSxHQUFHLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUUzQyxPQUFPO1lBQ0wsTUFBTTtZQUNOLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLFNBQVMsRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFO1lBQy9CLFNBQVMsRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFO1lBQy9CLE9BQU8sRUFBRSxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7U0FDaEQsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQUVELE1BQU0sVUFBVSxxQkFBcUIsQ0FBQyxPQUFvQjtJQUN4RCxPQUFPO1FBQ0wsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFO1FBQ2pDLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTTtRQUN0QixPQUFPLEVBQUU7WUFDUCxTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVM7WUFDNUIsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTO1lBQzVCLE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTztTQUN6QjtLQUNGLENBQUM7QUFDSixDQUFDIn0=