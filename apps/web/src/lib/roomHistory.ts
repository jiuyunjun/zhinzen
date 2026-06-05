/**
 * Recently joined rooms, kept locally (design.md: no accounts — history is just a
 * device-local convenience). At most {@link MAX_ENTRIES} rooms, newest first.
 */

const STORAGE_KEY = 'zhinzen.roomHistory.v1';
const MAX_ENTRIES = 10;

export interface RoomHistoryEntry {
  roomId: string;
  /** When this room was last created/joined on this device (epoch ms). */
  lastJoinedAt: number;
  /** Display names of members seen in this room, for avatar previews. */
  members?: string[];
}

function read(): RoomHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RoomHistoryEntry =>
          !!e &&
          typeof (e as RoomHistoryEntry).roomId === 'string' &&
          typeof (e as RoomHistoryEntry).lastJoinedAt === 'number',
      )
      .map((e) => ({
        roomId: e.roomId,
        lastJoinedAt: e.lastJoinedAt,
        members: Array.isArray(e.members) ? e.members.filter((m) => typeof m === 'string') : [],
      }))
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function write(entries: RoomHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Storage may be unavailable; history is best-effort.
  }
}

/** Newest-first list of recently joined rooms. */
export function getRoomHistory(): RoomHistoryEntry[] {
  return read();
}

/** Record a room as most-recently joined, de-duplicating and capping the list. */
export function addRoomToHistory(roomId: string): RoomHistoryEntry[] {
  // Preserve any previously captured members for this room until refreshed.
  const previous = read().find((entry) => entry.roomId === roomId)?.members ?? [];
  const next: RoomHistoryEntry[] = [
    { roomId, lastJoinedAt: Date.now(), members: previous },
    ...read().filter((entry) => entry.roomId !== roomId),
  ].slice(0, MAX_ENTRIES);
  write(next);
  return next;
}

/** Refresh the member-name preview for a room already in history. */
export function updateRoomMembers(roomId: string, members: string[]): RoomHistoryEntry[] {
  const current = read();
  if (!current.some((entry) => entry.roomId === roomId)) return current;
  const next = current.map((entry) => (entry.roomId === roomId ? { ...entry, members } : entry));
  write(next);
  return next;
}

/** Remove a room from the local history. */
export function removeRoomFromHistory(roomId: string): RoomHistoryEntry[] {
  const next = read().filter((entry) => entry.roomId !== roomId);
  write(next);
  return next;
}
