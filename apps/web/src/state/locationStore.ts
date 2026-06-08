import type { LiveLocation } from '@zhinzen/shared-types';
import { calculateDistance } from '@zhinzen/geo-utils';
import { create } from 'zustand';

import { setupPresence, writeLiveLocation } from '../lib/locationApi';
import { appendTrackPoint } from '../lib/trackApi';

type LocationPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied';
type LocationStatus = 'idle' | 'requesting' | 'watching' | 'error';

interface StartSharingInput {
  roomId: string;
  deviceId: string;
  deviceSecret: string;
  displayName: string;
}

interface LocationState {
  status: LocationStatus;
  permission: LocationPermissionState;
  current: LiveLocation | null;
  error: GeolocationPositionError['code'] | 'unsupported' | null;
  startSharing: (input: StartSharingInput) => Promise<boolean>;
  refreshNow: () => Promise<boolean>;
  /** Update the display name carried on future (and the current) live locations. */
  updateDisplayName: (displayName: string) => void;
  stopSharing: () => Promise<void>;
}

const MIN_UPLOAD_INTERVAL_MS = 3000;
// Adaptive track sampling: record once moved >= MIN distance (so faster motion
// yields denser points), with a MAX-interval heartbeat when still, throttled to
// a MIN interval so we never spam.
const TRACK_MIN_INTERVAL_MS = 2500;
const TRACK_MAX_INTERVAL_MS = 20000;
const TRACK_MIN_DISTANCE_M = 12;

let watchId: number | null = null;
let activeInput: StartSharingInput | null = null;
let lastUploadAt = 0;
let lastTrackAt = 0;
let lastTrackLat: number | null = null;
let lastTrackLng: number | null = null;
let cancelPresence: (() => void) | null = null;
let batteryLevel: number | null = null;

// Battery Status API (Chrome/Android only; absent on iOS/Firefox → stays null).
function initBattery(): void {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; addEventListener: (e: string, cb: () => void) => void }>;
  };
  if (!nav.getBattery) return;
  nav
    .getBattery()
    .then((b) => {
      const update = () => {
        batteryLevel = Math.round(b.level * 100);
      };
      update();
      b.addEventListener('levelchange', update);
    })
    .catch(() => {});
}

function positionToLiveLocation(
  position: GeolocationPosition,
  input: StartSharingInput,
  sharingLocation: boolean,
): LiveLocation {
  return {
    deviceId: input.deviceId,
    displayName: input.displayName,
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading:
      typeof position.coords.heading === 'number' && Number.isFinite(position.coords.heading)
        ? position.coords.heading
        : null,
    speed:
      typeof position.coords.speed === 'number' && Number.isFinite(position.coords.speed)
        ? position.coords.speed
        : 0,
    updatedAt: Date.now(),
    sharingLocation,
    battery: batteryLevel,
  };
}

async function publishLocation(
  position: GeolocationPosition,
  set: (state: Partial<LocationState>) => void,
  forceLiveUpload = false,
): Promise<void> {
  const active = activeInput;
  if (!active) return;

  const liveLocation = positionToLiveLocation(position, active, true);
  const now = Date.now();
  set({ status: 'watching', permission: 'granted', current: liveLocation, error: null });

  if (forceLiveUpload || now - lastUploadAt >= MIN_UPLOAD_INTERVAL_MS) {
    lastUploadAt = now;
    await writeLiveLocation(active.roomId, liveLocation);
  }

  const trackElapsed = now - lastTrackAt;
  const movedMeters =
    lastTrackLat !== null && lastTrackLng !== null
      ? calculateDistance({ lat: lastTrackLat, lng: lastTrackLng }, liveLocation)
      : Infinity;
  if (
    (trackElapsed >= TRACK_MIN_INTERVAL_MS && movedMeters >= TRACK_MIN_DISTANCE_M) ||
    trackElapsed >= TRACK_MAX_INTERVAL_MS
  ) {
    lastTrackAt = now;
    lastTrackLat = liveLocation.lat;
    lastTrackLng = liveLocation.lng;
    void appendTrackPoint({
      roomId: active.roomId,
      deviceId: active.deviceId,
      deviceSecret: active.deviceSecret,
      lat: liveLocation.lat,
      lng: liveLocation.lng,
      accuracy: liveLocation.accuracy,
      heading: liveLocation.heading,
      speed: liveLocation.speed,
      createdAt: liveLocation.updatedAt,
    }).catch(() => {
      // Track persistence is secondary; live sharing should continue.
    });
  }
}

async function readPermission(): Promise<LocationPermissionState> {
  if (!('permissions' in navigator)) return 'unknown';

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unknown';
  }
}

export const useLocationStore = create<LocationState>((set, get) => ({
  status: 'idle',
  permission: 'unknown',
  current: null,
  error: null,
  startSharing: async (input) => {
    if (!('geolocation' in navigator)) {
      set({ status: 'error', permission: 'denied', error: 'unsupported' });
      return false;
    }

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }

    activeInput = input;
    lastUploadAt = 0;
    lastTrackAt = 0;
    lastTrackLat = null;
    lastTrackLng = null;
    initBattery();
    cancelPresence?.();
    cancelPresence = setupPresence(input.roomId, input.deviceId);
    set({ status: 'requesting', permission: await readPermission(), error: null });

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          void publishLocation(position, set).catch(() => {
            set({ status: 'error', error: null });
          });

          if (!resolved) {
            resolved = true;
            resolve(true);
          }
        },
        (error) => {
          set({ status: 'error', permission: error.code === error.PERMISSION_DENIED ? 'denied' : 'unknown', error: error.code });
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 12000,
        },
      );
    });
  },
  refreshNow: async () => {
    if (!activeInput || !('geolocation' in navigator)) return false;

    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          void publishLocation(position, set, true)
            .then(() => resolve(true))
            .catch(() => {
              set({ status: 'error', error: null });
              resolve(false);
            });
        },
        (error) => {
          set({ status: 'error', permission: error.code === error.PERMISSION_DENIED ? 'denied' : 'unknown', error: error.code });
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
        },
      );
    });
  },
  updateDisplayName: (displayName) => {
    const trimmed = displayName.trim();
    if (activeInput) activeInput = { ...activeInput, displayName: trimmed };

    const current = get().current;
    if (current) {
      const updated = { ...current, displayName: trimmed, updatedAt: Date.now() };
      set({ current: updated });
      if (activeInput) {
        lastUploadAt = Date.now();
        void writeLiveLocation(activeInput.roomId, updated);
      }
    }
  },
  stopSharing: async () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    cancelPresence?.();
    cancelPresence = null;

    const active = activeInput;
    const current = get().current;
    activeInput = null;

    if (active && current) {
      await writeLiveLocation(active.roomId, {
        ...current,
        updatedAt: Date.now(),
        sharingLocation: false,
      });
    }

    set({ status: 'idle', current: null });
  },
}));
