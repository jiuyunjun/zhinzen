import type { Millis } from './common';

/**
 * Locally generated, never-shown participant credential. Persisted in client
 * storage; reused on subsequent launches (design.md §2.2, agents.md §5.2).
 *
 * This is NOT an account — it only distinguishes devices and lets the backend do
 * minimal write validation. `deviceSecret` must never be sent to peers or logged.
 */
export interface DeviceIdentity {
  deviceId: string;
  /** Local secret used to derive a write-validation proof. Never displayed. */
  deviceSecret: string;
  /** User-chosen display name (the only user-visible identity). */
  displayName: string;
}

/**
 * Server-side record backing a device's write permissions in a room.
 * Firestore path: `rooms/{roomId}/deviceSessions/{deviceId}` (design.md §6.2).
 * The raw `deviceSecret` is never stored — only its hash.
 */
export interface DeviceSession {
  deviceId: string;
  secretHash: string;
  createdAt: Millis;
  lastVerifiedAt: Millis;
}
