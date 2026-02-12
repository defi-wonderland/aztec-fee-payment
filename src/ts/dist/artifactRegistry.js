import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
function normalizeBaseUrl(baseUrl) {
    return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
export function getArtifactRegistryBaseUrl() {
    return (process.env.AZTEC_ARTIFACT_REGISTRY_URL ??
        "https://devnet.aztec-registry.xyz/");
}
export function shouldUploadArtifacts() {
    const v = process.env.AZTEC_ARTIFACT_REGISTRY_UPLOAD ?? "";
    return v === "1" || v.toLowerCase() === "true";
}
export function isStrictUpload() {
    const v = process.env.AZTEC_ARTIFACT_REGISTRY_STRICT ?? "";
    return v === "1" || v.toLowerCase() === "true";
}
export async function uploadArtifactToRegistry(params) {
    const base = normalizeBaseUrl(params.registryBaseUrl ?? getArtifactRegistryBaseUrl());
    const uploadUrl = new URL("api/upload", base).toString();
    const body = new FormData();
    const payload = JSON.stringify(params.artifact);
    body.set("file", new Blob([payload], { type: "application/json" }), params.filename);
    const res = await fetch(uploadUrl, { method: "POST", body });
    // The registry commonly returns JSON even on 409; treat duplicates as non-fatal by default.
    const text = await res.text();
    const parsed = text ? safeJsonParse(text) : { success: res.ok };
    if (res.ok) {
        return parsed ?? { success: true };
    }
    // Duplicate artifact (already uploaded) should not break deploys unless strict mode is enabled.
    if (res.status === 409) {
        return (parsed ?? {
            success: true,
            message: "Artifact already exists in registry",
        });
    }
    const msg = typeof parsed === "object" && parsed
        ? JSON.stringify(parsed)
        : text || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(`Artifact registry upload failed (${res.status}): ${msg}`);
}
export async function uploadArtifactFileToRegistry(params) {
    const buf = await readFile(params.artifactPath, "utf8");
    const artifact = JSON.parse(buf);
    const filename = params.filename ?? params.artifactPath.split("/").pop() ?? "artifact.json";
    return await uploadArtifactToRegistry({
        artifact,
        filename,
        registryBaseUrl: params.registryBaseUrl,
    });
}
export async function maybeUploadArtifactToRegistry(params) {
    if (!shouldUploadArtifacts())
        return null;
    try {
        const resp = await uploadArtifactToRegistry(params);
        return resp;
    }
    catch (err) {
        if (isStrictUpload())
            throw err;
        // Best-effort upload; do not fail deployments by default.
        console.warn(`[artifact-registry] Upload failed (continuing): ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
export async function fetchArtifactFromRegistry(params) {
    const base = normalizeBaseUrl(params.registryBaseUrl ?? getArtifactRegistryBaseUrl());
    const fetchUrl = new URL(`api/artifacts/${params.classId}`, base).toString();
    const res = await fetch(fetchUrl, { method: "GET" });
    if (!res.ok) {
        if (res.status === 404) {
            throw new Error(`Artifact not found in registry: ${params.classId}`);
        }
        throw new Error(`Failed to fetch artifact from registry (${res.status}): ${res.statusText}`);
    }
    const text = await res.text();
    return safeJsonParse(text);
}
/**
 * Loads an artifact from the registry with fallback to local file.
 * Tries registry first if classId is provided, then falls back to local file.
 */
export async function loadArtifactWithRegistryFallback(params) {
    // Try registry first if classId is provided
    if (params.classId) {
        try {
            const artifact = await fetchArtifactFromRegistry({
                classId: params.classId,
                registryBaseUrl: params.registryBaseUrl,
            });
            return artifact;
        }
        catch (error) {
            // Fall through to local file if registry fetch fails
            console.warn(`Failed to fetch artifact from registry, using local file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // Fallback to local file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const localArtifactPath = join(__dirname, "../../..", params.localPath);
    if (!existsSync(localArtifactPath)) {
        throw new Error(`Artifact not found at local path: ${localArtifactPath}. ` +
            (params.classId
                ? `Registry fetch also failed for classId: ${params.classId}`
                : "No classId provided for registry fetch."));
    }
    const buf = await readFile(localArtifactPath, "utf8");
    return JSON.parse(buf);
}
function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJ0aWZhY3RSZWdpc3RyeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL2FydGlmYWN0UmVnaXN0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQzVDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFDckMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUNqQyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQ3pDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFvQnBDLFNBQVMsZ0JBQWdCLENBQUMsT0FBZTtJQUN2QyxPQUFPLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxPQUFPLEdBQUcsQ0FBQztBQUN6RCxDQUFDO0FBRUQsTUFBTSxVQUFVLDBCQUEwQjtJQUN4QyxPQUFPLENBQ0wsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkI7UUFDdkMsb0NBQW9DLENBQ3JDLENBQUM7QUFDSixDQUFDO0FBRUQsTUFBTSxVQUFVLHFCQUFxQjtJQUNuQyxNQUFNLENBQUMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixJQUFJLEVBQUUsQ0FBQztJQUMzRCxPQUFPLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLFdBQVcsRUFBRSxLQUFLLE1BQU0sQ0FBQztBQUNqRCxDQUFDO0FBRUQsTUFBTSxVQUFVLGNBQWM7SUFDNUIsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsSUFBSSxFQUFFLENBQUM7SUFDM0QsT0FBTyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQyxXQUFXLEVBQUUsS0FBSyxNQUFNLENBQUM7QUFDakQsQ0FBQztBQUVELE1BQU0sQ0FBQyxLQUFL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