import { create } from 'zustand';

type CompassStatus = 'idle' | 'requesting' | 'watching' | 'unavailable';

interface SensorState {
  compassStatus: CompassStatus;
  heading: number | null;
  startCompass: () => Promise<boolean>;
  stopCompass: () => void;
}

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

type DeviceOrientationEventWithWebkit = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

let listening = false;
let removeListeners: (() => void) | null = null;
let setStateRef: ((state: Partial<SensorState>) => void) | null = null;

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function headingFromEvent(event: DeviceOrientationEvent): number | null {
  const candidate = event as DeviceOrientationEventWithWebkit;
  if (typeof candidate.webkitCompassHeading === 'number' && Number.isFinite(candidate.webkitCompassHeading)) {
    return normalizeAngle(candidate.webkitCompassHeading);
  }

  if (event.absolute && typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    return normalizeAngle(360 - event.alpha);
  }

  return null;
}

function onOrientation(event: DeviceOrientationEvent): void {
  const heading = headingFromEvent(event);
  if (heading === null) return;

  setStateRef?.({ heading, compassStatus: 'watching' });
}

async function requestOrientationPermission(): Promise<boolean> {
  const orientationEvent = window.DeviceOrientationEvent as DeviceOrientationEventWithPermission | undefined;
  const requestPermission = orientationEvent?.requestPermission;
  if (typeof requestPermission !== 'function') return true;

  try {
    return (await requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export const useSensorStore = create<SensorState>((set) => {
  setStateRef = set;

  return {
    compassStatus: 'idle',
    heading: null,
    startCompass: async () => {
      if (!('DeviceOrientationEvent' in window)) {
        set({ compassStatus: 'unavailable', heading: null });
        return false;
      }

      if (listening) return true;

      set({ compassStatus: 'requesting' });
      const allowed = await requestOrientationPermission();
      if (!allowed) {
        set({ compassStatus: 'unavailable', heading: null });
        return false;
      }

      window.addEventListener('deviceorientationabsolute', onOrientation);
      window.addEventListener('deviceorientation', onOrientation);
      listening = true;
      removeListeners = () => {
        window.removeEventListener('deviceorientationabsolute', onOrientation);
        window.removeEventListener('deviceorientation', onOrientation);
      };
      set({ compassStatus: 'watching' });
      return true;
    },
    stopCompass: () => {
      removeListeners?.();
      removeListeners = null;
      listening = false;
      set({ compassStatus: 'idle', heading: null });
    },
  };
});
