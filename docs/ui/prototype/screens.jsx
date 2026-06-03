// screens.jsx — onboarding, room choice, member detail sheet, finder mode

// ── Brand wordmark ───────────────────────────────────────────
function Wordmark({ size = 30, color = TOKENS.ink }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'var(--sans)', fontWeight: 700, fontSize: size, letterSpacing: '-0.03em', color }}>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span style={{ width: size * 0.42, height: size * 0.42, borderRadius: '50% 50% 50% 3px', transform: 'rotate(45deg)', background: TOKENS.self, boxShadow: `0 0 0 ${size*0.07}px ${TOKENS.selfSoft}` }} />
      </span>
      zhinzen
    </span>
  );
}

// ── Onboarding: name input ───────────────────────────────────
function Onboarding({ t, lang, name, setName, onContinue }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'oklch(0.98 0.004 250)', display: 'flex', flexDirection: 'column', padding: '0 26px', zIndex: 100 }}>
      {/* soft map hint behind top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 300, background: `radial-gradient(120% 90% at 50% 0%, ${TOKENS.selfSoft}, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
        <Wordmark size={34} />
        <h1 style={{ fontFamily: 'var(--sans)', fontSize: 30, lineHeight: 1.18, fontWeight: 700, letterSpacing: '-0.02em', color: TOKENS.ink, margin: '26px 0 10px', textWrap: 'balance' }}>{t('tagline')}</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: TOKENS.inkFaint, margin: 0, letterSpacing: '0.01em' }}>{t('noAccount')}</p>

        <div style={{ marginTop: 40 }}>
          <label style={{ fontFamily: 'var(--sans)', fontSize: 13.5, fontWeight: 600, color: TOKENS.inkSoft, display: 'block', marginBottom: 9 }}>{t('yourName')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('namePh')}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onContinue(); }}
            style={{ width: '100%', height: 56, boxSizing: 'border-box', padding: '0 18px', fontSize: 18, fontFamily: 'var(--sans)', color: TOKENS.ink, background: '#fff', border: `1.5px solid ${TOKENS.line}`, borderRadius: 16, outline: 'none' }} />
        </div>
      </div>
      <div style={{ paddingBottom: 40 }}>
        <PrimaryBtn onClick={onContinue} disabled={!name.trim()}>{t('continue')}</PrimaryBtn>
      </div>
    </div>
  );
}

// ── Room choice ──────────────────────────────────────────────
function RoomChoice({ t, name, onCreate, onJoin }) {
  const [code, setCode] = React.useState('');
  const card = (icon, title, sub, onClick, color) => (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 16, padding: 18, background: '#fff', border: `1.5px solid ${TOKENS.line}`, borderRadius: 20, cursor: 'pointer' }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: color.replace(')', ' / 0.14)'), color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={24} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--sans)', fontWeight: 650, fontSize: 17, color: TOKENS.ink }}>{title}</div>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: TOKENS.inkFaint, marginTop: 2 }}>{sub}</div>
      </div>
      <Icon name="chevron" size={18} color={TOKENS.inkFaint} />
    </button>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'oklch(0.98 0.004 250)', display: 'flex', flexDirection: 'column', padding: '0 22px', zIndex: 100 }}>
      <div style={{ paddingTop: 92 }}>
        <Wordmark size={22} color={TOKENS.inkSoft} />
        <h1 style={{ fontFamily: 'var(--sans)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: TOKENS.ink, margin: '18px 0 4px' }}>{t('hi', { name })}</h1>
        <p style={{ fontFamily: 'var(--sans)', fontSize: 15, color: TOKENS.inkSoft, margin: 0 }}>{t('pickAction')}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
        {card('share', t('createRoom'), t('createRoomSub'), onCreate, TOKENS.self)}
        {card('people', t('joinRoom'), t('joinRoomSub'), () => code.trim() && onJoin(), TOKENS.target)}
        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('joinPh')}
            style={{ flex: 1, height: 50, boxSizing: 'border-box', padding: '0 16px', fontSize: 15, fontFamily: 'var(--mono)', color: TOKENS.ink, background: '#fff', border: `1.5px solid ${TOKENS.line}`, borderRadius: 14, outline: 'none' }} />
          <PrimaryBtn onClick={() => code.trim() && onJoin()} disabled={!code.trim()} color={TOKENS.target} style={{ width: 84, height: 50 }}>{t('join')}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ── Mini relative-direction dial ─────────────────────────────
function MiniDial({ rel, size = 56, color }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'oklch(0.96 0.006 260)', border: `1.5px solid ${TOKENS.line}`, position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${rel}deg)`, transition: 'transform .4s ease' }}>
        <Icon name="nav" size={size * 0.5} color={color} sw={1.6} />
      </div>
    </div>
  );
}

// ── Member detail bottom sheet ───────────────────────────────
function MemberDetail({ t, lang, m, heading, trackOn, onClose, onToggleTrack, onNavigate, onFinder }) {
  const dm = meters(SELF, m);
  const d = fmtDist(t, dm);
  const brg = bearing(SELF, m);
  const rel = (brg - (heading || 0) + 360) % 360;
  const color = TOKENS.people[m.hue];
  const navDisabled = m.status === 'stale' || m.status === 'offline';
  return (
    <div style={{ fontFamily: 'var(--sans)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar m={m} lang={lang} size={52} ring={TOKENS.target} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: TOKENS.ink }}>{memberName(m, lang)}</span>
            <StatusDot status={m.status} />
          </div>
          <div style={{ fontSize: 13.5, color: TOKENS.inkSoft, marginTop: 1 }}>
            {statusLabel(t, m)} · {m.last === 0 ? t('updated', { t: t('now') }) : t('updated', { t: t('minAgo', { n: m.last }) })}
          </div>
        </div>
        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'oklch(0.94 0.006 260)', color: TOKENS.inkSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={18} />
        </button>
      </div>

      {/* distance + direction */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '18px 0', padding: '16px 18px', background: 'oklch(0.975 0.005 260)', borderRadius: 18 }}>
        <MiniDial rel={rel} color={color} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: TOKENS.inkFaint, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('away')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 34, fontWeight: 500, color: TOKENS.ink, lineHeight: 1 }}>{d.v}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 16, color: TOKENS.inkSoft }}>{d.u}</span>
          </div>
        </div>
        {m.status === 'stale' && (
          <span style={{ fontSize: 11.5, color: TOKENS.stale, fontWeight: 600, maxWidth: 92, textAlign: 'right', lineHeight: 1.3 }}>{t('mayMoved')}</span>
        )}
      </div>

      {/* capability chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {m.caps.uwb && <CapChip icon="uwb" label={t('uwbReady')} tone="uwb" />}
        {!m.caps.uwb && m.caps.ble && <CapChip icon="ble" label={t('bleRange')} tone="ble" />}
        {!m.caps.compass && <CapChip icon="compassOff" label={t('compassOff')} tone="muted" />}
      </div>

      {/* actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PrimaryBtn onClick={onFinder} color={TOKENS.target} style={{ height: 52 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, justifyContent: 'center' }}><Icon name="nav" size={20} />{t('pointMe')}</span>
        </PrimaryBtn>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={navDisabled ? undefined : onNavigate} disabled={navDisabled} style={{ flex: 1, height: 48, borderRadius: 14, border: `1.5px solid ${TOKENS.line}`, background: '#fff', color: navDisabled ? TOKENS.inkFaint : TOKENS.ink, fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600, cursor: navDisabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: navDisabled ? 0.6 : 1 }}>
            <Icon name="nav" size={18} color={TOKENS.online} />{t('navigate')}
          </button>
        </div>
        <button onClick={onToggleTrack} style={{ height: 44, borderRadius: 14, border: 'none', background: trackOn ? color.replace(')', ' / 0.14)') : 'oklch(0.96 0.006 260)', color: trackOn ? color : TOKENS.inkSoft, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="route" size={18} />{trackOn ? t('hideTrack') : t('showTrack')}
        </button>
      </div>
      {navDisabled && m.status === 'stale' && (
        <p style={{ fontSize: 12, color: TOKENS.stale, textAlign: 'center', margin: '12px 0 0' }}>{t('cantNavStale')}</p>
      )}
    </div>
  );
}

// ── Finder mode (immersive) ──────────────────────────────────
function Finder({ t, lang, m, heading, onExit }) {
  const dm = meters(SELF, m);
  const d = fmtDist(t, dm);
  const brg = bearing(SELF, m);
  const rel = (brg - (heading || 0) + 360) % 360;
  const color = TOKENS.people[m.hue];
  const near = dm < 120;
  const phase = near ? t('veryClose') : (m.status === 'moving' ? t('closing') : t('thisWay'));
  const noCompass = !m.caps.compass;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 50% 38%, oklch(0.30 0.05 300), oklch(0.16 0.02 280))', zIndex: 200, display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'var(--sans)' }}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '56px 20px 0' }}>
        <button onClick={onExit} style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', backdropFilter: 'blur(8px)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Avatar m={m} lang={lang} size={32} />
          <span style={{ fontSize: 16, fontWeight: 650 }}>{memberName(m, lang)}</span>
        </div>
        <div style={{ width: 42 }} />
      </div>

      {/* radar + arrow */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {[300, 220, 140].map((s, i) => (
          <div key={i} style={{ position: 'absolute', width: s, height: s, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.13)' }} />
        ))}
        <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', border: `2px solid ${color}`, opacity: 0.5, animation: 'targetPing 2.4s ease-out infinite' }} />
        {noCompass ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 18, opacity: 0.7 }}><Icon name="compassOff" size={56} color="#fff" sw={1.4} /></div>
            <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 200 }}>{t('noCompass')}</div>
          </div>
        ) : (
          <div style={{ transform: `rotate(${rel}deg)`, transition: 'transform .5s cubic-bezier(.22,.61,.36,1)', filter: `drop-shadow(0 8px 24px ${color.replace(')', ' / 0.6)')})` }}>
            <svg width="150" height="190" viewBox="0 0 150 190">
              <path d="M75 8 L128 168 L75 138 L22 168 Z" fill={color} stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      {/* distance readout */}
      <div style={{ textAlign: 'center', paddingBottom: 64 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color, marginBottom: 6 }}>{phase}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 7 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 76, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em' }}>{d.v}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 26, opacity: 0.7 }}>{d.u}</span>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, opacity: 0.55, marginTop: 14 }}>
          {m.caps.uwb ? 'UWB · ±0.3 m' : (dm > 600 ? t('lowAcc') : t('holdFlat'))}
        </div>
      </div>
    </div>
  );
}

// ── Self editor sheet (tap your own dot / avatar) ───────────
function SelfDetail({ t, lang, name, setName, accent, accents, onPickColor, sharing, onToggleShare, onLeave, onClose }) {
  const label = name && name.trim() ? name : t('you');
  return (
    <div style={{ fontFamily: 'var(--sans)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: 17, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontFamily: 'system-ui', fontSize: 22, boxShadow: `0 4px 12px ${accent.replace(')', ' / 0.35)')}`, flexShrink: 0 }}>
          {initial(label)}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: TOKENS.ink, whiteSpace: 'nowrap', flexShrink: 0 }}>{label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: accent, background: accent.replace(')', ' / 0.12)'), padding: '2px 7px', borderRadius: 7, flexShrink: 0 }}>{t('you')}</span>
          </div>
          <div style={{ fontSize: 13.5, color: TOKENS.inkSoft, marginTop: 1 }}>{sharing ? t('sharingOn') : t('sharingOff')}</div>
        </div>
        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'oklch(0.94 0.006 260)', color: TOKENS.inkSoft, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={18} />
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: TOKENS.inkFaint, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>{t('yourName')}</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('namePh')}
          style={{ width: '100%', height: 50, boxSizing: 'border-box', padding: '0 16px', fontSize: 16, fontFamily: 'var(--sans)', color: TOKENS.ink, background: 'oklch(0.975 0.005 260)', border: `1.5px solid ${TOKENS.line}`, borderRadius: 14, outline: 'none' }} />
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: TOKENS.inkFaint, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>{t('yourColor')}</label>
        <div style={{ display: 'flex', gap: 12 }}>
          {accents.map(c => {
            const on = c === accent;
            return (
              <button key={c} onClick={() => onPickColor(c)} style={{ width: 42, height: 42, borderRadius: '50%', background: c, border: on ? '3px solid #fff' : '3px solid transparent', boxShadow: on ? `0 0 0 2.5px ${c}, 0 3px 8px ${c.replace(')', ' / 0.4)')}` : 'inset 0 0 0 1px rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {on && <Icon name="check" size={20} color="#fff" sw={2.6} />}
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={onToggleShare} style={{ width: '100%', marginTop: 18, height: 50, borderRadius: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: sharing ? TOKENS.online.replace(')', ' / 0.12)') : 'oklch(0.96 0.006 260)', color: sharing ? TOKENS.online : TOKENS.inkSoft, fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icon name={sharing ? 'pause' : 'play'} size={18} />{sharing ? t('stopShare') : t('startShare')}
        </span>
        <span style={{ width: 38, height: 22, borderRadius: 11, background: sharing ? TOKENS.online : 'oklch(0.82 0.01 260)', position: 'relative', transition: 'background .2s' }}>
          <span style={{ position: 'absolute', top: 2, left: sharing ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
        </span>
      </button>

      <button onClick={onLeave} style={{ width: '100%', marginTop: 10, height: 46, borderRadius: 14, border: 'none', cursor: 'pointer', background: TOKENS.danger.replace(')', ' / 0.10)'), color: TOKENS.danger, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="back" size={17} />{t('leaveRoom')}
      </button>
    </div>
  );
}

Object.assign(window, { Wordmark, Onboarding, RoomChoice, MemberDetail, Finder, MiniDial, SelfDetail });
