import { randomBytes, createHash } from 'node:crypto';

import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

// Run in the same region as Firestore (asia-northeast1) so room transactions are
// local, and close to the (currently Asia-based) users — avoids the US↔Tokyo and
// user↔US round-trips that made create/join slow. Keep the client's
// getFunctions(app, 'asia-northeast1') in sync (apps/web/src/lib/firebase.ts).
setGlobalOptions({ region: 'asia-northeast1' });

initializeApp();

const db = getFirestore();

const ROOM_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ROOM_CODE_LENGTH = 10;
const DEFAULT_ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_MEMBERS = 20;
const DEFAULT_TRACK_RETENTION_MINUTES = 24 * 60;
const MAX_TRACK_POINT_CLOCK_SKEW_MS = 5 * 60 * 1000;

type Platform = 'web' | 'android' | 'ios';
type SegmentKind = 'stopped' | 'slow' | 'moving' | 'fast';

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

interface AppendTrackPointRequest {
  roomId: string;
  deviceId: string;
  deviceSecret: string;
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number;
  createdAt?: number;
}

interface AppendTrackPointResponse {
  roomId: string;
  deviceId: string;
  pointId: string;
  createdAt: number;
  expiresAt: number;
  segmentKind: SegmentKind;
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

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpsError('invalid-argument', `${field} must be a finite number.`);
  }

  return value;
}

function normalizeHeading(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const heading = requireNumber(value, 'heading');
  return ((heading % 360) + 360) % 360;
}

function normalizeAppendTrackPointRequest(data: unknown): AppendTrackPointRequest {
  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const roomId = normalizeRoomId(requireString(payload.roomId, 'roomId', 64));
  const lat = requireNumber(payload.lat, 'lat');
  const lng = requireNumber(payload.lng, 'lng');
  const accuracy = requireNumber(payload.accuracy, 'accuracy');
  const speed = requireNumber(payload.speed, 'speed');
  const createdAt =
    payload.createdAt === undefined ? undefined : requireNumber(payload.createdAt, 'createdAt');

  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId is required.');
  }

  if (lat < -90 || lat > 90) {
    throw new HttpsError('invalid-argument', 'lat is out of range.');
  }

  if (lng < -180 || lng > 180) {
    throw new HttpsError('invalid-argument', 'lng is out of range.');
  }

  if (accuracy < 0) {
    throw new HttpsError('invalid-argument', 'accuracy must be >= 0.');
  }

  if (speed < 0 || speed > 120) {
    throw new HttpsError('invalid-argument', 'speed is out of range.');
  }

  return {
    roomId,
    deviceId: requireString(payload.deviceId, 'deviceId', 128),
    deviceSecret: requireString(payload.deviceSecret, 'deviceSecret', 256),
    lat,
    lng,
    accuracy,
    heading: normalizeHeading(payload.heading),
    speed,
    createdAt,
  };
}

function segmentKindForSpeed(speed: number): SegmentKind {
  if (speed < 0.3) return 'stopped';
  if (speed < 1.5) return 'slow';
  if (speed < 5) return 'moving';
  return 'fast';
}

function validTrackCreatedAt(inputCreatedAt: number | undefined, now: number): number {
  if (inputCreatedAt === undefined) return now;

  if (Math.abs(inputCreatedAt - now) > MAX_TRACK_POINT_CLOCK_SKEW_MS) {
    return now;
  }

  return Math.trunc(inputCreatedAt);
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

export const appendTrackPoint = onCall(
  async (request): Promise<AppendTrackPointResponse> => {
    const payload = normalizeAppendTrackPointRequest(request.data);
    const now = Date.now();
    const roomRef = db.collection('rooms').doc(payload.roomId);
    const sessionRef = roomRef.collection('deviceSessions').doc(payload.deviceId);
    const memberRef = roomRef.collection('members').doc(payload.deviceId);
    const secretHash = hashSecret(payload.roomId, payload.deviceId, payload.deviceSecret);

    return db.runTransaction(async (transaction) => {
      const [roomSnapshot, sessionSnapshot] = await Promise.all([
        transaction.get(roomRef),
        transaction.get(sessionRef),
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

      if (!sessionSnapshot.exists || sessionSnapshot.data()?.secretHash !== secretHash) {
        throw new HttpsError('permission-denied', 'Device session does not match.');
      }

      const retentionMinutes =
        typeof room.trackRetentionMinutes === 'number'
          ? room.trackRetentionMinutes
          : DEFAULT_TRACK_RETENTION_MINUTES;
      const createdAt = validTrackCreatedAt(payload.createdAt, now);
      const expiresAt = Math.min(room.expiresAt, createdAt + retentionMinutes * 60 * 1000);
      const segmentKind = segmentKindForSpeed(payload.speed);
      const pointId = `${createdAt}_${randomBytes(3).toString('hex')}`;
      const pointRef = roomRef
        .collection('tracks')
        .doc(payload.deviceId)
        .collection('points')
        .doc(pointId);

      transaction.create(pointRef, {
        lat: payload.lat,
        lng: payload.lng,
        accuracy: payload.accuracy,
        heading: payload.heading,
        speed: payload.speed,
        createdAt,
        expiresAt,
        segmentKind,
      });
      transaction.set(
        sessionRef,
        {
          lastVerifiedAt: now,
        },
        { merge: true },
      );
      transaction.set(
        memberRef,
        {
          lastSeenAt: now,
          sharingLocation: true,
        },
        { merge: true },
      );

      return {
        roomId: payload.roomId,
        deviceId: payload.deviceId,
        pointId,
        createdAt,
        expiresAt,
        segmentKind,
      };
    });
  },
);
