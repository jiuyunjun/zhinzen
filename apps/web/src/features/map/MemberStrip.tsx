import { color as tokens, font, withAlpha } from '@zhinzen/shared-ui';
import { useUiStore } from '../../state/uiStore';

/**
 * Bottom member strip skeleton (design.md §5.2, §7.3). For now it shows only the
 * self chip — other members and their live distance/status arrive with backend
 * presence in Phase 2. The header member count is hard-coded to 1 accordingly.
 */
export function MemberStrip({ selfName, sharing }: { selfName: string; sharing: boolean }) {
  const t = useUiStore((s) => s.t);
  const me = selfName.trim() || t('you');
  const sharingLabel = sharing ? t('sharingShort') : t('pausedShort');

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 4px 12px',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: tokens.ink, whiteSpace: 'nowrap' }}>
          1 {t('members')}{' '}
          <span style={{ color: tokens.online, fontWeight: 600, fontSize: 13 }}>
            · 1 {t('online')}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: font.mono,
            fontSize: 11.5,
            color: sharing ? tokens.online : tokens.inkFaint,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: sharing ? tokens.online : tokens.offline,
            }}
          />
          {sharingLabel}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 7,
            width: 66,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 15,
              background: tokens.self,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontFamily: 'system-ui',
              fontSize: 17,
              boxShadow: `0 0 0 2.5px ${withAlpha(tokens.self, 0.16)}`,
            }}
          >
            {[...me][0]}
          </div>
          <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: tokens.ink,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 66,
              }}
            >
              {me}
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 10.5, color: tokens.self, marginTop: 1 }}>
              {sharingLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
