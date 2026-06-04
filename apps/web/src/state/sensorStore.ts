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

// Heading smoothing: raw compass readings jitter a lot on phones. We low-pass
// them with a circular exponential moving average and only emit when the smoothed
// value moves past a small threshold, so the on-screen arrow stays steady.
const SMOOTHING_ALPHA = 0.18;
const MIN_EMIT_DELTA_DEG = 0.6;
let smoothedHeading: number | null = null;
let lastEmittedHeading: number | null = null;

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** Shortest signed angular distance from `current` to `target`, in (-180, 180]. */
function shortestDelta(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
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
  const raw = headingFromEvent(event);
  if (raw === null) return;

  smoothedHeading =
    smoothedHeading === null
      ? raw
      : normalizeAngle(smoothedHeading + SMOOTHING_ALPHA * shortestDelta(raw, smoothedHeading));

  if (
    lastEmittedHeading === null ||
    Math.abs(shortestDelta(smoothedHeading, lastEmittedHeading)) >= MIN_EMIT_DELTA_DEG
  ) {
    lastEmittedHeading = smoothedHeading;
    setStateRef?.({ heading: smoothedHeading, compassStatus: 'watching' });
  }
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
      smoothedHeading = null;
      lastEmittedHeading = null;
      set({ compassStatus: 'idle', heading: null });
    },
  };
});
