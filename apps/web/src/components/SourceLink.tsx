import { color as tokens } from '@zhinzen/shared-ui';
import { useUiStore } from '../state/uiStore';
import { Icon } from './Icon';

export const SOURCE_URL = 'https://github.com/jiuyunjun/zhinzen';

/**
 * Entry point to the project's public source. Sits next to <LangToggle /> in the
 * chrome of the pre-map screens, sharing its pill shape so the two read as one group.
 */
export function SourceLink({
  dark = false,
  compact = false,
}: {
  dark?: boolean;
  /** Icon only — for the map screen, where the top bar has no room for a label. */
  compact?: boolean;
}) {
  const t = useUiStore((s) => s.t);
  const label = `${t('sourceCode')} · GitHub`;
  return (
    <a
      href={SOURCE_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      title={compact ? label : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 36,
        width: compact ? 36 : undefined,
        padding: compact ? 0 : '0 12px',
        borderRadius: 12,
        textDecoration: 'none',
        background: dark ? 'rgba(255,255,255,0.14)' : '#fff',
        color: dark ? '#fff' : tokens.inkSoft,
        boxShadow: dark ? 'none' : `0 0 0 1px ${tokens.line}`,
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <Icon name="github" size={16} strokeWidth={1.8} />
      {!compact && t('sourceCode')}
    </a>
  );
}
