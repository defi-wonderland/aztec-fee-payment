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
  } else if (obj !== null && typeof obj === "object") {
    const normalized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "path" && typeof value === "string") {
        normalized[key] = normalizePath(value);
      } else {
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
  } catch (error) {
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
      console.log(
        `Directory ${distTargetDir} does not exist, skipping normalization`,
      );
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
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
