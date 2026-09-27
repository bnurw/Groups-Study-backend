/**
 * Stage 4D: Gemini AI Model Configuration.
 *
 * Centralized constant for the Gemini model identifier.
 * Uses the official supported Gemini Flash alias: 'gemini-flash-latest'.
 * Can be overridden at runtime via the GEMINI_MODEL environment variable or Cloudflare secret.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
