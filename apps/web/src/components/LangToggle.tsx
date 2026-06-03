import { color as tokens } from '@zhinzen/shared-ui';
import { useUiStore } from '../state/uiStore';
import { Icon } from './Icon';

/**
 * Minimal language switcher (zh ⇄ en). Replaces the prototype's Tweaks-panel
 * language control with a real in-app affordance, satisfying the i18n-ready goal.
 */
export function LangToggle({ dark = false }: { dark?: boolean }) {
  const lang = useUiStore((s) => s.lang);
  const toggleLang = useUiStore((s) => s.toggleLang);
  return (
    <button
      type="button"
      onClick={toggleLang}
      aria-label="Switch language"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 36,
        padding: '0 12px',
        borderRadius: 12,
        border: 'none',
        cursor: 'pointer',
        background: dark ? 'rgba(255,255,255,0.14)' : '#fff',
        color: dark ? '#fff' : tokens.inkSoft,
        boxShadow: dark ? 'none' : `0 0 0 1px ${tokens.line}`,
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <Icon name="globe" size={16} strokeWidth={1.8} />
      {lang === 'zh' ? '中' : 'EN'}
    </button>
  );
}
