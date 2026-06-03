import { color as tokens, withAlpha } from '@zhinzen/shared-ui';

/** Brand wordmark: a self-colored pin glyph + "zhinzen" (ported from screens.jsx). */
export function Wordmark({ size = 30, color = tokens.ink }: { size?: number; color?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        fontWeight: 700,
        fontSize: size,
        letterSpacing: '-0.03em',
        color,
      }}
    >
      <span
        style={{
          width: size * 0.42,
          height: size * 0.42,
          borderRadius: '50% 50% 50% 3px',
          transform: 'rotate(45deg)',
          background: tokens.self,
          boxShadow: `0 0 0 ${size * 0.07}px ${withAlpha(tokens.self, 0.16)}`,
        }}
      />
      zhinzen
    </span>
  );
}
