/**
 * Zhinzen Cloud Functions — entry point.
 *
 * Phase 0 scaffold: only a health check is wired up. The functions below are
 * planned per design.md §6.1 and the security model in §15 — they MUST be
 * implemented before the rules' "TODO(phase-N)" client-write shortcuts are
 * tightened:
 *
 *   - createRoom        : generate a high-entropy roomId, set expiry, register the
 *                         creator's deviceSession (hash of deviceSecret). (Phase 2)
 *   - joinRoom          : validate room capacity/expiry, create deviceSession. (Phase 2)
 *   - cleanupExpired    : scheduled (Cloud Scheduler) purge of expired rooms and
 *                         tracks past their retention window. (Phase 3)
 *   - verifyWrite       : shared deviceSecret-hash validation helper. (Phase 2)
 *
 * Deployed independently of the root npm workspace (own package.json/deps).
 */
import { onRequest } from 'firebase-functions/v2/https';

/** Liveness probe — confirms the functions codebase deploys and serves. */
export const health = onRequest((_req, res) => {
  res.json({ ok: true, service: 'zhinzen-functions', phase: 0 });
});
