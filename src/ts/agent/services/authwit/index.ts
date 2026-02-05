/**
 * Authwit Service
 *
 * Re-exports from crypto service for convenience.
 * The actual authwit generation logic is in services/crypto/authwit.ts
 */

export { AuthwitGenerator, formatAuthwitResponse } from "../crypto/authwit.js";
