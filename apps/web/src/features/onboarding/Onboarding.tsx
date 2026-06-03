import { useState } from 'react';
import { color as tokens, font, withAlpha } from '@zhinzen/shared-ui';
import { useDeviceStore } from '../../state/deviceStore';
import { useUiStore } from '../../state/uiStore';
import { Wordmark } from '../../components/Wordmark';
import { PrimaryButton } from '../../components/PrimaryButton';
import { LangToggle } from '../../components/LangToggle';

/**
 * Onboarding — the only identity step. The user enters a display name; no
 * registration/login (design.md §4.1, §2.1). The deviceId/secret already exist
 * silently. On submit we persist the name and continue.
 */
export function Onboarding({ onContinue }: { onContinue: () => void }) {
  const t = useUiStore((s) => s.t);
  const existingName = useDeviceStore((s) => s.displayName);
  const setDisplayName = useDeviceStore((s) => s.setDisplayName);
  const [name, setName] = useState(existingName);

  const canContinue = name.trim().length > 0;
  const submit = () => {
    if (!canContinue) return;
    setDisplayName(name);
    onContinue();
  };

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '0 26px',
        background: 'oklch(0.98 0.004 250)',
      }}
    >
      {/* soft brand glow behind the top */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 320,
          background: `radial-gradient(120% 90% at 50% 0%, ${withAlpha(tokens.self, 0.16)}, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'absolute', top: 'max(20px, env(safe-area-inset-top))', right: 22 }}>
        <LangToggle />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          maxWidth: 440,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <Wordmark size={34} />
        <h1
          style={{
            fontSize: 30,
            lineHeight: 1.18,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: tokens.ink,
            margin: '26px 0 10px',
            textWrap: 'balance',
          }}
        >
          {t('tagline')}
        </h1>
        <p
          style={{
            fontFamily: font.mono,
            fontSize: 12.5,
            color: tokens.inkFaint,
            margin: 0,
            letterSpacing: '0.01em',
          }}
        >
          {t('noAccount')}
        </p>

        <div style={{ marginTop: 40 }}>
          <label
            htmlFor="display-name"
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: tokens.inkSoft,
              display: 'block',
              marginBottom: 9,
            }}
          >
            {t('yourName')}
          </label>
          <input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePh')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            autoComplete="off"
            style={{
              width: '100%',
              height: 56,
              boxSizing: 'border-box',
              padding: '0 18px',
              fontSize: 18,
              fontFamily: 'inherit',
              color: tokens.ink,
              background: '#fff',
              border: `1.5px solid ${tokens.line}`,
              borderRadius: 16,
              outline: 'none',
            }}
          />
        </div>
      </div>

      <div
        style={{
          paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
          maxWidth: 440,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <PrimaryButton onClick={submit} disabled={!canContinue}>
          {t('continue')}
        </PrimaryButton>
      </div>
    </div>
  );
}
