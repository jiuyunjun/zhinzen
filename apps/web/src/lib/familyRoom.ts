/**
 * The "family room": a room id this device pins to auto-enter on launch, so you
 * and your people just open the app and see each other. Device-local (no account).
 */
const KEY = 'zhinzen.familyRoom.v1';

export function getFamilyRoom(): string | null {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function setFamilyRoom(roomId: string | null): void {
  try {
    if (roomId) localStorage.setItem(KEY, roomId);
    else localStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}
