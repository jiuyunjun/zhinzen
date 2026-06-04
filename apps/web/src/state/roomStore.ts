import { create } from 'zustand';
import { parseRoomInput, roomFromUrl } from '../lib/roomCode';
import { addRoomToHistory } from '../lib/roomHistory';
import { useDeviceStore } from './deviceStore';
import {
  buildRoomPayload,
  createRoomOnBackend,
  joinRoomOnBackend,
  toRoomApiError,
  type RoomApiErrorCode,
} from '../lib/roomApi';

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
  pendingJoinCode: string | null;
  /** Whether this device is currently sharing its location. */
  sharing: boolean;
  busy: boolean;
  error: RoomApiErrorCode | null;
  createRoom: () => Promise<string | null>;
  /** Join from a pasted invite link or raw code; returns the normalized id or null. */
  joinRoom: (input: string) => Promise<string | null>;
  /** Best-effort re-upsert of this device's member record (e.g. after a rename). */
  syncMembership: () => Promise<void>;
  leaveRoom: () => void;
  setSharing: (on: boolean) => void;
  clearError: () => void;
}

function syncUrl(roomId: string | null): void {
  const target = roomId ? `#/r/${roomId}` : '#/';
  if (window.location.hash !== target) {
    history.replaceState(null, '', target);
  }
}

export const useRoomStore = create<RoomState>((set, get) => ({
  roomId: null,
  // Pick up an invite link without joining until the backend validates it.
  pendingJoinCode: roomFromUrl(),
  sharing: true,
  busy: false,
  error: null,
  createRoom: async () => {
    const device = useDeviceStore.getState();
    set({ busy: true, error: null });
    try {
      const room = await createRoomOnBackend(
        buildRoomPayload({
          deviceId: device.deviceId,
          deviceSecret: device.deviceSecret,
          displayName: device.displayName,
          sharingLocation: true,
        }),
      );
      syncUrl(room.roomId);
      addRoomToHistory(room.roomId);
      set({ roomId: room.roomId, pendingJoinCode: null, sharing: true, busy: false });
      return room.roomId;
    } catch (error) {
      const roomError = toRoomApiError(error);
      set({ busy: false, error: roomError.code });
      return null;
    }
  },
  joinRoom: async (input) => {
    const roomId = parseRoomInput(input);
    if (!roomId) return null;
    const device = useDeviceStore.getState();
    set({ busy: true, error: null });
    try {
      const room = await joinRoomOnBackend({
        ...buildRoomPayload({
          deviceId: device.deviceId,
          deviceSecret: device.deviceSecret,
          displayName: device.displayName,
          sharingLocation: true,
        }),
        roomId,
      });
      syncUrl(room.roomId);
      addRoomToHistory(room.roomId);
      set({ roomId: room.roomId, pendingJoinCode: null, sharing: true, busy: false });
      return room.roomId;
    } catch (error) {
      const roomError = toRoomApiError(error);
      set({ busy: false, error: roomError.code });
      return null;
    }
  },
  syncMembership: async () => {
    const roomId = get().roomId;
    if (!roomId) return;
    const device = useDeviceStore.getState();
    try {
      await joinRoomOnBackend({
        ...buildRoomPayload({
          deviceId: device.deviceId,
          deviceSecret: device.deviceSecret,
          displayName: device.displayName,
          sharingLocation: get().sharing,
        }),
        roomId,
      });
    } catch {
      // Best-effort: a failed rename sync shouldn't disrupt the session.
    }
  },
  leaveRoom: () => {
    syncUrl(null);
    set({ roomId: null, pendingJoinCode: null, error: null });
  },
  setSharing: (on) => set({ sharing: on }),
  clearError: () => set({ error: null }),
}));
