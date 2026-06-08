import type { DeviceCapabilities, Platform } from '@zhinzen/shared-types';
import { httpsCallable } from 'firebase/functions';

import { getFirebaseServices } from './firebase';

interface RoomFunctionPayload {
  deviceId: string;
  deviceSecret: string;
  displayName: string;
  platform: Platform;
  capabilities: Partial<DeviceCapabilities>;
  sharingLocation: boolean;
}

interface JoinRoomPayload extends RoomFunctionPayload {
  roomId: string;
}

export interface RoomFunctionResult {
  roomId: string;
  expiresAt: number;
  maxMembers: number;
  trackRetentionMinutes: number;
  createdByDeviceId: string;
}

export type RoomApiErrorCode =
  | 'not-found'
  | 'failed-precondition'
  | 'resource-exhausted'
  | 'permission-denied'
  | 'invalid-argument'
  | 'unavailable'
  | 'unknown';

export class RoomApiError extends Error {
  constructor(
    public readonly code: RoomApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RoomApiError';
  }
}

const webCapabilities: Partial<DeviceCapabilities> = {
  location: 'geolocation' in navigator,
  imu: 'DeviceMotionEvent' in window,
  compass: 'DeviceOrientationEvent' in window,
  uwb: false,
  ble: false,
};

export function buildRoomPayload(input: {
  deviceId: string;
  deviceSecret: string;
  displayName: string;
  sharingLocation?: boolean;
}): RoomFunctionPayload {
  return {
    deviceId: input.deviceId,
    deviceSecret: input.deviceSecret,
    displayName: input.displayName,
    platform: 'web',
    capabilities: webCapabilities,
    sharingLocation: input.sharingLocation ?? true,
  };
}

export async function createRoomOnBackend(
  payload: RoomFunctionPayload,
): Promise<RoomFunctionResult> {
  const { functions } = getFirebaseServices();
  const createRoom = httpsCallable<RoomFunctionPayload, RoomFunctionResult>(
    functions,
    'createRoom',
  );
  const result = await createRoom(payload);
  return result.data;
}

export async function joinRoomOnBackend(
  payload: JoinRoomPayload,
): Promise<RoomFunctionResult> {
  const { functions } = getFirebaseServices();
  const joinRoom = httpsCallable<JoinRoomPayload, RoomFunctionResult>(functions, 'joinRoom');
  const result = await joinRoom(payload);
  return result.data;
}

export async function kickMemberOnBackend(payload: {
  roomId: string;
  deviceId: string;
  deviceSecret: string;
  targetDeviceId: string;
}): Promise<void> {
  const { functions } = getFirebaseServices();
  const kick = httpsCallable(functions, 'kickMember');
  await kick(payload);
}

export function toRoomApiError(error: unknown): RoomApiError {
  const candidate = error as { code?: unknown; message?: unknown };
  const code =
    candidate.code === 'not-found' ||
    candidate.code === 'failed-precondition' ||
    candidate.code === 'resource-exhausted' ||
    candidate.code === 'permission-denied' ||
    candidate.code === 'invalid-argument' ||
    candidate.code === 'unavailable'
      ? candidate.code
      : 'unknown';

  const message =
    typeof candidate.message === 'string' && candidate.message
      ? candidate.message
      : 'Room request failed.';

  return new RoomApiError(code, message);
}
