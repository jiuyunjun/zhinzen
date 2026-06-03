import { create } from 'zustand';
import { generateRoomId, parseRoomInput, roomFromUrl } from '../lib/roomCode';

/**
 * roomState (design.md §14) — which room this device is in and whether it is
 * sharing its location.
 *
 * NOTE (skeleton): there is no backend yet, so creating/joining only sets local
 * state and the URL hash. Phase 2 swaps these actions for real room records
 * (capacity, expiry, deviceSession) behind the same interface.
 */
interface RoomState {
  roomId: string | null;
  /** Whether this device is currently sharing its location. */
  sharing: boolean;
  createRoom: () => string;
  /** Join from a pasted invite link or raw code; returns the normalized id or null. */
  joinRoom: (input: string) => string | null;
  leaveRoom: () => void;
  setSharing: (on: boolean) => void;
}

function syncUrl(roomId: string | null): void {
  const target = roomId ? `#/r/${roomId}` : '#/';
  if (window.location.hash !== target) {
    history.replaceState(null, '', target);
  }
}

export const useRoomStore = create<RoomState>((set) => ({
  // Pick up an invite link the app was opened with.
  roomId: roomFromUrl(),
  sharing: true,
  createRoom: () => {
    const roomId = generateRoomId();
    syncUrl(roomId);
    set({ roomId, sharing: true });
    return roomId;
  },
  joinRoom: (input) => {
    const roomId = parseRoomInput(input);
    if (!roomId) return null;
    syncUrl(roomId);
    set({ roomId, sharing: true });
    return roomId;
  },
  leaveRoom: () => {
    syncUrl(null);
    set({ roomId: null });
  },
  setSharing: (on) => set({ sharing: on }),
}));
