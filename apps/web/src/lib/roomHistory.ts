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
  const next: RoomHistoryEntry[] = [
    { roomId, lastJoinedAt: Date.now() },
    ...read().filter((entry) => entry.roomId !== roomId),
  ].slice(0, MAX_ENTRIES);
  write(next);
  return next;
}

/** Remove a room from the local history. */
export function removeRoomFromHistory(roomId: string): RoomHistoryEntry[] {
  const next = read().filter((entry) => entry.roomId !== roomId);
  write(next);
  return next;
}
