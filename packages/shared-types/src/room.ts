import type { Millis } from './common';

/** Lifecycle of a room. A room becomes `expired` past `expiresAt`. */
export type RoomStatus = 'active' | 'expired' | 'closed';

/**
 * A shared space identified by a high-entropy, hard-to-guess `roomId`.
 * Firestore path: `rooms/{roomId}` (design.md §6.2).
 */
export interface Room {
  roomId: string;
  createdAt: Millis;
  expiresAt: Millis;
  status: RoomStatus;
  /** Hard cap on simultaneous members. */
  maxMembers: number;
  /** How long member tracks are retained, in minutes. */
  trackRetentionMinutes: number;
  /** Device that created the room (not an owner/account — just provenance). */
  createdByDeviceId: string;
}
