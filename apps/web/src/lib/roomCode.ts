/**
 * Room identifiers and invite links (design.md §2.3, §11.1).
 *
 * A room is identified by a high-entropy, hard-to-guess code that doubles as the
 * shareable join code. We use Crockford base32 (no ambiguous I/L/O/U) so the code
 * is readable and typeable; 10 symbols ≈ 50 bits of entropy. The invite link
 * carries the same code via the URL hash, so no server route config is needed.
 *
 * NOTE (skeleton): there is no backend yet, so a room is purely client-side this
 * phase. Phase 2 introduces server-side room records + capacity/expiry checks.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
const CODE_LEN = 10;

/** Generate a fresh high-entropy room code, e.g. `"7K2Q9XF3MN"`. */
export function generateRoomId(): string {
  const buf = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[buf[i] % ALPHABET.length];
  }
  return out;
}

/** Format a raw room code for display, grouped in fours: `"7K2Q-9XF3-MN"`. */
export function formatRoomCode(roomId: string): string {
  return (roomId.match(/.{1,4}/g) ?? [roomId]).join('-');
}

/** Build the shareable invite link for a room code. */
export function inviteLink(roomId: string, origin: string = window.location.origin): string {
  return `${origin}/#/r/${roomId}`;
}

/**
 * Extract a normalized room code from arbitrary user input — either a pasted
 * invite link (`…/#/r/CODE`) or a raw, possibly dash-grouped code. Returns null
 * when nothing usable is present. Does not verify the room exists (no backend yet).
 */
export function parseRoomInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // If it looks like an invite link, take the segment after `/r/`.
  const linkMatch = trimmed.match(/\/r\/([^/?#\s]+)/i);
  const candidate = linkMatch ? linkMatch[1] : trimmed;

  // Keep only alphabet characters, uppercased.
  const normalized = candidate
    .toUpperCase()
    .split('')
    .filter((ch) => ALPHABET.includes(ch))
    .join('');

  return normalized.length > 0 ? normalized : null;
}

/** Read a room code from the current URL hash (`#/r/CODE`), if present. */
export function roomFromUrl(): string | null {
  return parseRoomInput(window.location.hash);
}
