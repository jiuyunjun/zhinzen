import type { DeviceIdentity } from '@zhinzen/shared-types';

/**
 * Device-as-user identity (design.md §2.2, agents.md §5.2).
 *
 * On first launch we generate a `deviceId` + `deviceSecret` and persist them
 * locally; subsequent launches reuse them. This is NOT an account — there is no
 * login/registration. The user only ever sets a `displayName`.
 *
 * `deviceSecret` is a local credential used (in later phases) to derive a
 * write-validation proof for the backend. It must never be shown to the user,
 * sent to peers, or logged.
 */

const STORAGE_KEY = 'zhinzen.device.v1';

interface StoredIdentity {
  deviceId: string;
  deviceSecret: string;
  displayName: string;
}

/** Cryptographically strong random hex string of `bytes` length. */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function readStored(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
    if (typeof parsed.deviceId === 'string' && typeof parsed.deviceSecret === 'string') {
      return {
        deviceId: parsed.deviceId,
        deviceSecret: parsed.deviceSecret,
        displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      };
    }
  } catch {
    // Corrupt / unavailable storage — fall through and regenerate.
  }
  return null;
}

function writeStored(identity: StoredIdentity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Storage may be unavailable (private mode, quota). The in-memory identity
    // still works for this session; persistence is best-effort.
  }
}

/**
 * Load the persisted device identity, generating and storing a fresh
 * `deviceId`/`deviceSecret` on first launch. `displayName` may be empty until
 * the user completes onboarding.
 */
export function loadOrCreateIdentity(): DeviceIdentity {
  const existing = readStored();
  if (existing) return existing;

  const created: StoredIdentity = {
    // `randomUUID` is widely available in modern mobile browsers; the secret uses
    // 32 random bytes of entropy.
    deviceId: crypto.randomUUID(),
    deviceSecret: randomHex(32),
    displayName: '',
  };
  writeStored(created);
  return created;
}

/** Persist a new display name onto the existing identity. */
export function saveDisplayName(displayName: string): void {
  const current = readStored() ?? loadOrCreateIdentity();
  writeStored({ ...current, displayName });
}
