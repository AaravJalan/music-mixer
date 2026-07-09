/**
 * Deprecated / Discovery logic (kept for reference).
 *
 * Spotify Development Mode restrictions (Feb 2026) make these endpoints unreliable:
 * - `/artists/{id}/top-tracks` → 403
 * - `/artists` (batch)        → 403
 *
 * The live collision pipeline now runs in "Safe-Discovery" mode and should not call any
 * of the functions that relied on these endpoints. This file is intentionally not
 * imported anywhere in production code.
 */

// Intentionally empty placeholder for moved code.
export {};

