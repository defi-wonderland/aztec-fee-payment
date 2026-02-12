import type { NoirCompiledContract } from "@aztec/aztec.js/abi";
export type ArtifactRegistryUploadResponse =
  | {
      success: true;
      filename?: string;
      classId?: string;
      contractName?: string;
      functionCount?: number;
      [key: string]: unknown;
    }
  | {
      success: false;
      error?: string;
      message?: string;
      [key: string]: unknown;
    };
export declare function getArtifactRegistryBaseUrl(): string;
export declare function shouldUploadArtifacts(): boolean;
export declare function isStrictUpload(): boolean;
export declare function uploadArtifactToRegistry(params: {
  artifact: unknown;
  filename: string;
  registryBaseUrl?: string;
}): Promise<ArtifactRegistryUploadResponse>;
export declare function uploadArtifactFileToRegistry(params: {
  artifactPath: string;
  filename?: string;
  registryBaseUrl?: string;
}): Promise<ArtifactRegistryUploadResponse>;
export declare function maybeUploadArtifactToRegistry(params: {
  artifact: unknown;
  filename: string;
  registryBaseUrl?: string;
}): Promise<ArtifactRegistryUploadResponse | null>;
export declare function fetchArtifactFromRegistry(params: {
  classId: string;
  registryBaseUrl?: string;
}): Promise<unknown>;
/**
 * Loads an artifact from the registry with fallback to local file.
 * Tries registry first if classId is provided, then falls back to local file.
 */
export declare function loadArtifactWithRegistryFallback(params: {
  classId?: string;
  localPath: string;
  registryBaseUrl?: string;
}): Promise<NoirCompiledContract>;
//# sourceMappingURL=artifactRegistry.d.ts.map
