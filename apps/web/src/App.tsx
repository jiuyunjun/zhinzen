import { color, font, withAlpha } from '@zhinzen/shared-ui';
import { calculateDistance, formatDistance } from '@zhinzen/geo-utils';
import type { LatLng } from '@zhinzen/shared-types';

/**
 * Phase 0 placeholder. It deliberately pulls one symbol from each workspace
 * package so a successful render proves the monorepo wiring (types + geo-utils +
 * design tokens) resolves end to end. Phase 1 replaces this with the real
 * onboarding → room → map flow (see docs/ui/prototype for the target design).
 */
const TOKYO_STATION: LatLng = { lat: 35.681236, lng: 139.767125 };
const SHIBUYA_STATION: LatLng = { lat: 35.658034, lng: 139.701636 };

export function App() {
  const d = formatDistance(calculateDistance(TOKYO_STATION, SHIBUYA_STATION));

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 9,
          fontFamily: font.sans,
          fontWeight: 700,
          fontSize: 34,
          letterSpacing: '-0.03em',
          color: color.ink,
        }}
      >
        <span
          style={{
            width: 15,
            height: 15,
            borderRadius: '50% 50% 50% 3px',
            transform: 'rotate(45deg)',
            background: color.self,
            boxShadow: `0 0 0 5px ${withAlpha(color.self, 0.16)}`,
          }}
        />
        zhinzen
      </span>

      <p style={{ margin: 0, color: color.inkSoft, fontFamily: font.sans, fontSize: 15 }}>
        和身边的人，实时互相找到。
      </p>

      <code
        style={{
          fontFamily: font.mono,
          fontSize: 13,
          color: color.inkFaint,
          padding: '8px 14px',
          borderRadius: 10,
          background: withAlpha(color.self, 0.08),
        }}
      >
        Phase 0 · 脚手架就绪 · 东京站 → 涩谷站 ≈ {d.value} {d.unit}
      </code>
    </main>
  );
}
