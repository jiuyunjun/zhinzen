import { create } from 'zustand';
import { loadOrCreateIdentity, saveDisplayName } from '../lib/deviceIdentity';

/**
 * deviceState (design.md §14) — the local device-as-user identity. The
 * deviceId/deviceSecret are created once and persisted; only the displayName is
 * user-editable. Identity is loaded eagerly when the store is first imported.
 */
interface DeviceState {
  deviceId: string;
  deviceSecret: string;
  displayName: string;
  /** True once the user has chosen a display name (completed onboarding). */
  hasName: boolean;
  setDisplayName: (name: string) => void;
}

const identity = loadOrCreateIdentity();

export const useDeviceStore = create<DeviceState>((set) => ({
  deviceId: identity.deviceId,
  deviceSecret: identity.deviceSecret,
  displayName: identity.displayName,
  hasName: identity.displayName.trim().length > 0,
  setDisplayName: (name) => {
    const trimmed = name.trim();
    saveDisplayName(trimmed);
    set({ displayName: trimmed, hasName: trimmed.length > 0 });
  },
}));
