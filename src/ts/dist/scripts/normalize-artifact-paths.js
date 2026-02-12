#!/usr/bin/env node
/**
 * Normalizes absolute paths in artifact JSON files to ensure consistency
 * across different build environments (local vs CI).
 *
 * Replaces absolute paths like:
 * - /Users/username/nargo/... -> $HOME/nargo/...
 * - /home/runner/nargo/... -> $HOME/nargo/...
 * - /Users/username/project/... -> <project-root>/...
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Get the dist/target directory
const distTargetDir = join(__dirname, "../dist/target");
const projectRoot = resolve(__dirname, "../../..");
/**
 * Normalizes a path by replacing absolute path prefixes with normalized placeholders
 */
function normalizePath(path) {
    if (!path || typeof path !== "string") {
        return path;
    }
    // Normalize project paths first (most specific)
    // Replace absolute project paths with relative paths from project root
    if (path.startsWith(projectRoot)) {
        return path.replace(projectRoot, "<project-root>");
    }
    // Normalize nargo paths (dependency cache)
    // Matches patterns like /Users/username/nargo/... or /home/runner/nargo/...
    // These are typically in ~/nargo/ or similar locations
    if (path.includes("/nargo/")) {
        const nargoIndex = path.indexOf("/nargo/");
        if (nargoIndex !== -1) {
            // Keep everything from /nargo/ onwards, but normalize the prefix
            return "$HOME" + path.substring(nargoIndex);
        }
    }
    // Normalize common absolute path patterns
    // macOS: /Users/username/...
    if (path.startsWith("/Users/")) {
        const parts = path.split("/");
        if (parts.length >= 3) {
            // Replace /Users/username with $HOME
            return "$HOME/" + parts.slice(3).join("/");
        }
    }
    // Linux: /home/username/...
    if (path.startsWith("/home/")) {
        const parts = path.split("/");
        if (parts.length >= 3) {
            // Replace /home/username with $HOME
            return "$HOME/" + parts.slice(3).join("/");
        }
    }
    // If no normalization needed, return as-is
    return path;
}
/**
 * Recursively normalizes paths in an object
 */
function normalizeObject(obj) {
    if (Array.isArray(obj)) {
        return obj.map(normalizeObject);
    }
    else if (obj !== null && typeof obj === "object") {
        const normalized = {};
        for (const [key, value] of Object.entries(obj)) {
            if (key === "path" && typeof value === "string") {
                normalized[key] = normalizePath(value);
            }
            else {
                normalized[key] = normalizeObject(value);
            }
        }
        return normalized;
    }
    return obj;
}
/**
 * Normalizes paths in a JSON artifact file
 */
function normalizeArtifactFile(filePath) {
    try {
        const content = readFileSync(filePath, "utf8");
        const artifact = JSON.parse(content);
        // Normalize paths in the artifact
        const normalized = normalizeObject(artifact);
        // Write back with proper formatting
        writeFileSync(filePath, JSON.stringify(normalized, null, 2) + "\n", "utf8");
        console.log(`✓ Normalized paths in ${filePath}`);
    }
    catch (error) {
        console.error(`✗ Error processing ${filePath}:`, error.message);
        process.exit(1);
    }
}
/**
 * Main function
 */
function main() {
    try {
        // Check if dist/target directory exists
        if (!statSync(distTargetDir).isDirectory()) {
            console.log(`Directory ${distTargetDir} does not exist, skipping normalization`);
            return;
        }
        // Find all JSON files in dist/target
        const files = readdirSync(distTargetDir)
            .filter((file) => file.endsWith(".json"))
            .map((file) => join(distTargetDir, file));
        if (files.length === 0) {
            console.log("No JSON files found in dist/target");
            return;
        }
        console.log(`Normalizing paths in ${files.length} artifact file(s)...`);
        files.forEach(normalizeArtifactFile);
        console.log("✓ Path normalization complete");
    }
    catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9ybWFsaXplLWFydGlmYWN0LXBhdGhzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2NyaXB0cy9ub3JtYWxpemUtYXJ0aWZhY3QtcGF0aHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUVBOzs7Ozs7OztHQVFHO0FBRUgsT0FBTyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxNQUFNLFNBQVMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDbkQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUV6QyxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUNsRCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFdEMsZ0NBQWdDO0FBQ2hDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztBQUN4RCxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBRW5EOztHQUVHO0FBQ0gsU0FBUyxhQUFhLENBQUMsSUFBSTtJQUN6QixJQUFJLENBQUMsSUFBSSxJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQ3RDLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVELGdEQUFnRDtJQUNoRCx1RUFBdUU7SUFDdkUsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7UUFDakMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRCwyQ0FBMkM7SUFDM0MsNEVBQTRFO0lBQzVFLHVEQUF1RDtJQUN2RCxJQUFJLElBQUksQ0FB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