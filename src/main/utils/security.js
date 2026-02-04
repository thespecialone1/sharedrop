
import path from 'path';

/**
 * Validates and resolves a requested path against a base path to prevent traversal.
 * @param {string} requestedPath - The relative path requested.
 * @param {string} basePath - The absolute base directory path.
 * @returns {string|null} The resolved absolute path if valid, or null if invalid (traversal attempt).
 */
export function validatePath(requestedPath, basePath) {
    // If no path requested, return root
    if (!requestedPath || typeof requestedPath !== 'string') {
        return basePath;
    }

    // Resolve the full path
    const securePath = path.resolve(basePath, requestedPath);

    // Security check: ensure the resolved path is within the base path
    // We check if it starts with the base directory
    if (!securePath.startsWith(basePath)) {
        return null;
    }

    return securePath;
}
