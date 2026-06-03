// ui.jsx — shared primitives: icons, avatar, status, buttons, sheet
const S = React.createElement;

// ── Icons (simple geometric strokes) ─────────────────────────
function Icon({ name, size = 22, color = 'currentColor', sw = 2 }) {
  const p = { fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    copy:   <g {...p}><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V5.5A1.5 1.5 0 016.5 4H15"/></g>,
    share:  <g {...p}><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.1 10.9l7.8-3.8M8.1 13.1l7.8 3.8"/></g>,
    recenter: <g {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></g>,
    route:  <g {...p}><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 17c5-1 3-9 8-11"/></g>,
    nav:    <g {...p}><path d="M12 3l8 18-8-5-8 5 8-18z"/></g>,
    close:  <g {...p}><path d="M6 6l12 12M18 6L6 18"/></g>,
    back:   <g {...p}><path d="M15 5l-7 7 7 7"/></g>,
    chevron:<g {...p}><path d="M9 6l6 6-6 6"/></g>,
    pause:  <g {...p}><path d="M9 5v14M15 5v14"/></g>,
    play:   <g {...p}><path d="M7 4l13 8-13 8z"/></g>,
    uwb:    <g {...p}><circle cx="12" cy="12" r="1.6" fill={color}/><path d="M7.5 7.5a6.4 6.4 0 000 9M16.5 7.5a6.4 6.4 0 010 9M4.7 4.7a10.4 10.4 0 000 14.6M19.3 4.7a10.4 10.4 0 010 14.6"/></g>,
    ble:    <g {...p}><path d="M8 7l8 5-4 3V5l4 3-8 5"/></g>,
    people: <g {...p}><circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0111 0"/><path d="M16 6.2a3 3 0 010 5.6M16.5 19a5.5 5.5 0 00-2-4.3"/></g>,
    compassOff: <g {...p}><circle cx="12" cy="12" r="9"/><path d="M4 4l16 16"/></g>,
    check:  <g {...p}><path d="M5 12.5l4.5 4.5L19 7"/></g>,
    link:   <g {...p}><path d="M9.5 14.5l5-5M8 12l-2 2a3.2 3.2 0 004.5 4.5l2-2M16 12l2-2a3.2 3.2 0 00-4.5-4.5l-2 2"/></g>,
  };
  return S('svg', { width: size, height: size, viewBox: '0 0 24 24' }, paths[name]);
}

// ── Avatar (square pin-less, for lists) ──────────────────────
function Avatar({ m, lang, size = 44, ring }) {
  const off = m.status === 'offline';
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.34, flexShrink: 0,
      background: off ? TOKENS.offline : TOKENS.people[m.hue], opacity: off ? 0.55 : 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.4, fontFamily: 'system-ui',
      border: ring ? `2.5px solid ${ring}` : 'none',
      boxShadow: ring ? `0 4px 12px ${ring.replace(')', ' / 0.35)')}` : 'none',
    }}>{initial(memberName(m, lang))}</div>
  );
}

function StatusDot({ status, size = 10 }) {
  const c = status === 'offline' ? TOKENS.offline : status === 'stale' ? TOKENS.stale : TOKENS.online;
  return <span style={{
    width: size, height: size, borderRadius: '50%', background: c, display: 'inline-block',
    boxShadow: '0 0 0 2px #fff', flexShrink: 0,
    animation: status === 'moving' ? 'movingDot 1.2s ease-in-out infinite' : 'none',
  }} />;
}

function statusLabel(t, m) {
  if (!m.sharing) return t('notSharing');
  return t({ online: 'online', moving: 'moving', stale: 'stale', offline: 'offline' }[m.status]);
}

// ── Floating round glass button ──────────────────────────────
function FabButton({ icon, onClick, active, label, dark }) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      width: 46, height: 46, borderRadius: 16, border: 'none', cursor: 'pointer',
      background: active ? TOKENS.self : (dark ? 'rgba(38,40,46,0.82)' : 'rgba(255,255,255,0.92)'),
      color: active ? '#fff' : (dark ? '#fff' : TOKENS.ink),
      backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)',
      boxShadow: '0 4px 14px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'background .2s, transform .15s',
    }}>
      <Icon name={icon} size={22} sw={2.1} />
    </button>
  );
}

// ── Primary / secondary buttons ──────────────────────────────
function PrimaryBtn({ children, onClick, disabled, color = TOKENS.self, style = {} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', height: 54, borderRadius: 16, border: 'none',
      background: disabled ? 'oklch(0.86 0.01 260)' : color, color: '#fff',
      fontSize: 17, fontWeight: 650, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
      letterSpacing: '0.01em', boxShadow: disabled ? 'none' : '0 6px 18px rgba(0,0,0,0.16)',
      transition: 'transform .12s, background .2s', ...style,
    }}>{children}</button>
  );
}

// ── Capability chip ──────────────────────────────────────────
function CapChip({ icon, label, tone }) {
  const c = tone === 'uwb' ? TOKENS.target : tone === 'ble' ? TOKENS.self : TOKENS.inkSoft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px',
      borderRadius: 9, background: c.replace(')', ' / 0.12)'), color: c,
      fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--mono)',
    }}>
      <Icon name={icon} size={14} sw={2} />{label}
    </span>
  );
}

Object.assign(window, { Icon, Avatar, StatusDot, statusLabel, FabButton, PrimaryBtn, CapChip });
