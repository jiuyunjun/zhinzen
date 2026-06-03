import { randomBytes, createHash } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();

const ROOM_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ROOM_CODE_LENGTH = 10;
const DEFAULT_ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_MEMBERS = 20;
const DEFAULT_TRACK_RETENTION_MINUTES = 120;

type Platform = 'web' | 'android' | 'ios';

interface DeviceCapabilities {
  location: boolean;
  imu: boolean;
  compass: boolean;
  uwb: boolean;
  ble: boolean;
}

interface RoomRequest {
  deviceId: string;
  deviceSecret: string;
  displayName: string;
  platform?: Platform;
  capabilities?: Partial<DeviceCapabilities>;
  sharingLocation?: boolean;
}

interface JoinRoomRequest extends RoomRequest {
  roomId: string;
}

interface RoomResponse {
  roomId: string;
  expiresAt: number;
  maxMembers: number;
  trackRetentionMinutes: number;
}

const defaultCapabilities: DeviceCapabilities = {
  location: false,
  imu: false,
  compass: false,
  uwb: false,
  ble: false,
};

function generateRoomId(): string {
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  let id = '';
  for (const byte of bytes) {
    id += ROOM_ALPHABET[byte % ROOM_ALPHABET.length];
  }
  return id;
}

function normalizeRoomId(roomId: string): string {
  return roomId
    .toUpperCase()
    .split('')
    .filter((char) => ROOM_ALPHABET.includes(char))
    .join('');
}

function hashSecret(roomId: string, deviceId: string, deviceSecret: string): string {
  return createHash('sha256').update(`${roomId}:${deviceId}:${deviceSecret}`).digest('hex');
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${field} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw new HttpsError('invalid-argument', `${field} is too long.`);
  }

  return trimmed;
}

function normalizePlatform(value: unknown): Platform {
  return value === 'android' || value === 'ios' || value === 'web' ? value : 'web';
}

function normalizeCapabilities(value: unknown): DeviceCapabilities {
  if (!value || typeof value !== 'object') {
    return defaultCapabilities;
  }

  const capabilities = value as Partial<Record<keyof DeviceCapabilities, unknown>>;
  return {
    location: capabilities.location === true,
    imu: capabilities.imu === true,
    compass: capabilities.compass === true,
    uwb: capabilities.uwb === true,
    ble: capabilities.ble === true,
  };
}

function normalizeRoomRequest(data: unknown): RoomRequest {
  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return {
    deviceId: requireString(payload.deviceId, 'deviceId', 128),
    deviceSecret: requireString(payload.deviceSecret, 'deviceSecret', 256),
    displayName: requireString(payload.displayName, 'displayName', 40),
    platform: normalizePlatform(payload.platform),
    capabilities: normalizeCapabilities(payload.capabilities),
    sharingLocation: payload.sharingLocation === true,
  };
}

function normalizeJoinRoomRequest(data: unknown): JoinRoomRequest {
  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const roomId = normalizeRoomId(requireString(payload.roomId, 'roomId', 64));

  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required.');
  }

  return {
    ...normalizeRoomRequest(data),
    roomId,
  };
}

function memberData(request: RoomRequest, now: number) {
  return {
    deviceId: request.deviceId,
    displayName: request.displayName,
    joinedAt: now,
    lastSeenAt: now,
    online: true,
    sharingLocation: request.sharingLocation === true,
    platform: request.platform ?? 'web',
    capabilities: {
      ...defaultCapabilities,
      ...(request.capabilities ?? {}),
    },
  };
}

/** Liveness probe — confirms the functions codebase deploys and serves. */
export const health = onRequest((_req, res) => {
  res.json({ ok: true, service: 'zhinzen-functions', phase: 0 });
});

export const createRoom = onCall(async (request): Promise<RoomResponse> => {
  const payload = normalizeRoomRequest(request.data);
  const now = Date.now();
  const expiresAt = now + DEFAULT_ROOM_TTL_MS;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomId = generateRoomId();
    const roomRef = db.collection('rooms').doc(roomId);
    const memberRef = roomRef.collection('members').doc(payload.deviceId);
    const sessionRef = roomRef.collection('deviceSessions').doc(payload.deviceId);
    const secretHash = hashSecret(roomId, payload.deviceId, payload.deviceSecret);

    try {
      await db.runTransaction(async (transaction) => {
        const existingRoom = await transaction.get(roomRef);
        if (existingRoom.exists) {
          throw new HttpsError('already-exists', 'Room id collision.');
        }

        transaction.create(roomRef, {
          roomId,
          createdAt: now,
          expiresAt,
          status: 'active',
          maxMembers: DEFAULT_MAX_MEMBERS,
          trackRetentionMinutes: DEFAULT_TRACK_RETENTION_MINUTES,
          createdByDeviceId: payload.deviceId,
        });
        transaction.create(sessionRef, {
          deviceId: payload.deviceId,
          secretHash,
          createdAt: now,
          lastVerifiedAt: now,
        });
        transaction.create(memberRef, memberData(payload, now));
      });

      return {
        roomId,
        expiresAt,
        maxMembers: DEFAULT_MAX_MEMBERS,
        trackRetentionMinutes: DEFAULT_TRACK_RETENTION_MINUTES,
      };
    } catch (error) {
      if (error instanceof HttpsError && error.code === 'already-exists') {
        continue;
      }
      throw error;
    }
  }

  throw new HttpsError('internal', 'Could not allocate a room id.');
});

export const joinRoom = onCall(async (request): Promise<RoomResponse> => {
  const payload = normalizeJoinRoomRequest(request.data);
  const now = Date.now();
  const roomRef = db.collection('rooms').doc(payload.roomId);
  const memberRef = roomRef.collection('members').doc(payload.deviceId);
  const sessionRef = roomRef.collection('deviceSessions').doc(payload.deviceId);
  const membersRef = roomRef.collection('members');
  const secretHash = hashSecret(payload.roomId, payload.deviceId, payload.deviceSecret);

  return db.runTransaction(async (transaction) => {
    const [roomSnapshot, memberSnapshot, sessionSnapshot, membersSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(memberRef),
      transaction.get(sessionRef),
      transaction.get(membersRef),
    ]);

    if (!roomSnapshot.exists) {
      throw new HttpsError('not-found', 'Room does not exist.');
    }

    const room = roomSnapshot.data();
    if (!room || room.status !== 'active' || typeof room.expiresAt !== 'number') {
      throw new HttpsError('failed-precondition', 'Room is not active.');
    }

    if (room.expiresAt <= now) {
      throw new HttpsError('failed-precondition', 'Room has expired.');
    }

    const maxMembers =
      typeof room.maxMembers === 'number' ? room.maxMembers : DEFAULT_MAX_MEMBERS;

    if (!memberSnapshot.exists && membersSnapshot.size >= maxMembers) {
      throw new HttpsError('resource-exhausted', 'Room is full.');
    }

    if (sessionSnapshot.exists && sessionSnapshot.data()?.secretHash !== secretHash) {
      throw new HttpsError('permission-denied', 'Device session does not match.');
    }

    transaction.set(
      sessionRef,
      {
        deviceId: payload.deviceId,
        secretHash,
        createdAt: sessionSnapshot.data()?.createdAt ?? now,
        lastVerifiedAt: now,
      },
      { merge: true },
    );

    transaction.set(
      memberRef,
      {
        ...memberData(payload, now),
        joinedAt: memberSnapshot.data()?.joinedAt ?? now,
      },
      { merge: true },
    );

    return {
      roomId: payload.roomId,
      expiresAt: room.expiresAt,
      maxMembers,
      trackRetentionMinutes:
        typeof room.trackRetentionMinutes === 'number'
          ? room.trackRetentionMinutes
          : DEFAULT_TRACK_RETENTION_MINUTES,
    };
  });
});
