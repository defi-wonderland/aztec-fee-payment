import type { Hex } from "viem";
import type { AuthwitResponse } from "../../types/index.js";
export interface MintAuthwit {
  amount: bigint;
  secret: string;
  innerHash: string;
  outerHash: string;
  witness: string[];
}
export declare class AuthwitGenerator {
  private fpcAddress;
  private ownerAddress;
  private ownerSigningKey;
  private schnorr;
  private chainId;
  private version;
  constructor(config: {
    fpcAddress: string;
    ownerAddress: string;
    ownerSigningKey: Hex;
    chainId: bigint;
    version?: bigint;
  });
  generateMintAuthwit(amount: bigint, secretHex: Hex): Promise<MintAuthwit>;
}
export declare function formatAuthwitResponse(
  authwit: MintAuthwit,
): AuthwitResponse;
//# sourceMappingURL=authwit.d.ts.map
