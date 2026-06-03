// mockmap.jsx — stylized procedural map (geometric only) + markers + tracks
// World is a fixed 1000×1000 plane; the viewport pans to center `focus`.

const MAP_THEMES = {
  light: {
    paper:  'oklch(0.955 0.006 140)',
    road:   'oklch(0.995 0 0)',
    casing: 'oklch(0.905 0.006 140)',
    block:  'oklch(0.918 0.008 90)',
    blockB: 'oklch(0.895 0.01 70)',
    park:   'oklch(0.885 0.055 150)',
    water:  'oklch(0.865 0.05 232)',
    label:  'oklch(0.60 0.02 250)',
  },
  dark: {
    paper:  'oklch(0.205 0.012 255)',
    road:   'oklch(0.305 0.012 255)',
    casing: 'oklch(0.255 0.012 255)',
    block:  'oklch(0.245 0.014 255)',
    blockB: 'oklch(0.275 0.016 255)',
    park:   'oklch(0.305 0.04 155)',
    water:  'oklch(0.315 0.05 236)',
    label:  'oklch(0.62 0.02 255)',
  },
};

// road grid lines across the 1000×1000 world
const ROADS = [
  { x: 0, y: 235, w: 1000, h: 30 },
  { x: 0, y: 520, w: 1000, h: 44 },   // main avenue
  { x: 0, y: 790, w: 1000, h: 28 },
  { x: 175, y: 0, w: 30, h: 1000 },
  { x: 470, y: 0, w: 40, h: 1000 },   // main avenue
  { x: 765, y: 0, w: 28, h: 1000 },
];
// diagonal boulevard
const DIAG = { x: -120, y: 120, w: 1400, h: 34, rot: 34 };
// building blocks
const BLOCKS = [
  [40,40,110,150],[230,40,210,150],[540,40,180,150],[820,40,150,150],
  [40,290,110,180],[230,300,200,150],[560,300,170,180],[820,300,150,160],
  [40,600,110,150],[245,600,190,150],[560,600,180,150],[825,600,140,150],
  [40,850,110,120],[245,850,190,120],[560,850,180,120],[825,850,140,120],
];
const PARKS = [[540,600,180,150],[230,40,210,150]];
const WATER = { x: 700, y: 560, w: 520, h: 520, rot: 18 };

function Rect({ d, fill, r = 6, rot = 0, op = 1, extra = {} }) {
  return (
    <div style={{
      position: 'absolute', left: d[0], top: d[1], width: d[2], height: d[3],
      background: fill, borderRadius: r, opacity: op,
      transform: rot ? `rotate(${rot}deg)` : undefined, ...extra,
    }} />
  );
}

function MapBackdrop({ mt }) {
  return (
    <React.Fragment>
      {/* water */}
      <div style={{
        position: 'absolute', left: WATER.x, top: WATER.y, width: WATER.w, height: WATER.h,
        background: mt.water, transform: `rotate(${WATER.rot}deg)`, borderRadius: 40,
      }} />
      {/* blocks */}
      {BLOCKS.map((b, i) => <Rect key={'b'+i} d={b} fill={i % 3 === 0 ? mt.blockB : mt.block} r={7} />)}
      {/* parks */}
      {PARKS.map((p, i) => <Rect key={'p'+i} d={p} fill={mt.park} r={10} />)}
      {/* road casings (slightly larger, behind) */}
      {ROADS.map((rd, i) => (
        <Rect key={'rc'+i} d={[rd.x-3, rd.y-3, rd.w+6, rd.h+6]} fill={mt.casing} r={4} />
      ))}
      <Rect d={[DIAG.x-3, DIAG.y-3, DIAG.w+6, DIAG.h+6]} fill={mt.casing} r={6} rot={DIAG.rot} />
      {/* roads */}
      {ROADS.map((rd, i) => <Rect key={'r'+i} d={[rd.x, rd.y, rd.w, rd.h]} fill={mt.road} r={3} />)}
      <Rect d={[DIAG.x, DIAG.y, DIAG.w, DIAG.h]} fill={mt.road} r={5} rot={DIAG.rot} />
    </React.Fragment>
  );
}

// ── Track polyline ───────────────────────────────────────────
function Track({ points, color }) {
  if (!points || points.length < 2) return null;
  const d = points.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
  return (
    <svg width="1000" height="1000" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeLinejoin="round" opacity="0.32" />
      <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
            strokeLinejoin="round" strokeDasharray="1 11" opacity="0.9" />
    </svg>
  );
}

// ── Self marker: accuracy disc + heading cone + dot ──────────
function SelfMarker({ heading = null, accuracy = 70 }) {
  return (
    <div style={{ position: 'absolute', left: SELF.x, top: SELF.y, transform: 'translate(-50%,-50%)' }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: accuracy * 2, height: accuracy * 2,
        marginLeft: -accuracy, marginTop: -accuracy, borderRadius: '50%',
        background: TOKENS.selfSoft, animation: 'selfPulse 3s ease-in-out infinite',
      }} />
      {heading != null && (
        <div style={{
          position: 'absolute', left: '50%', top: '50%', width: 120, height: 120,
          marginLeft: -60, marginTop: -60, transform: `rotate(${heading}deg)`,
          background: `conic-gradient(from -22deg at 50% 50%, ${TOKENS.self} 0deg, transparent 44deg)`,
          WebkitMaskImage: 'radial-gradient(circle at 50% 50%, #000 0, #000 38%, transparent 62%)',
          maskImage: 'radial-gradient(circle at 50% 50%, #000 0, #000 38%, transparent 62%)',
          opacity: 0.5, borderRadius: '50%',
        }} />
      )}
      <div style={{
        position: 'relative', width: 22, height: 22, borderRadius: '50%',
        background: TOKENS.self, border: '3px solid #fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }} />
    </div>
  );
}

// ── Member pin ───────────────────────────────────────────────
function MemberPin({ m, lang, selected, onClick }) {
  const color = TOKENS.people[m.hue];
  const off = m.status === 'offline';
  const stale = m.status === 'stale';
  const dot = off ? TOKENS.offline : stale ? TOKENS.stale : TOKENS.online;
  const ring = selected ? TOKENS.target : '#fff';
  return (
    <button onClick={() => onClick(m.id)} style={{
      position: 'absolute', left: m.x, top: m.y,
      transform: `translate(-50%,-50%) scale(${selected ? 1.12 : 1})`,
      border: 'none', background: 'none', padding: 0, cursor: 'pointer',
      transition: 'transform .35s cubic-bezier(.3,1.3,.5,1)', zIndex: selected ? 5 : 2,
    }}>
      {selected && (
        <div style={{
          position: 'absolute', inset: -7, borderRadius: '50%',
          border: `2.5px solid ${TOKENS.target}`, animation: 'targetPing 1.6s ease-out infinite',
        }} />
      )}
      <div style={{
        width: 42, height: 42, borderRadius: '50% 50% 50% 4px',
        transform: 'rotate(45deg)', background: off ? TOKENS.offline : color,
        border: `3px solid ${ring}`, opacity: off ? 0.55 : 1,
        boxShadow: selected ? `0 6px 18px ${TOKENS.target.replace(')', ' / 0.45)')}` : '0 3px 9px rgba(0,0,0,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          transform: 'rotate(-45deg)', color: '#fff', fontWeight: 700, fontSize: 17,
          fontFamily: 'system-ui',
        }}>{initial(memberName(m, lang))}</span>
      </div>
      <div style={{
        position: 'absolute', right: -2, top: -2, width: 13, height: 13, borderRadius: '50%',
        background: dot, border: '2.5px solid #fff',
        animation: m.status === 'moving' ? 'movingDot 1.2s ease-in-out infinite' : 'none',
      }} />
    </button>
  );
}

// ── MockMap ──────────────────────────────────────────────────
function MockMap({ theme, members, selectedId, trackId, focus, heading, lang, onSelectMember, onSelectSelf }) {
  const mt = MAP_THEMES[theme] || MAP_THEMES.light;
  const VW = 402, CY = 372; // center focus a bit above middle (sheet covers bottom)
  const tx = VW / 2 - focus.x;
  const ty = CY - focus.y;
  const selMember = members.find(m => m.id === trackId);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: mt.paper }}>
      <div style={{
        position: 'absolute', width: 1000, height: 1000, left: 0, top: 0,
        transform: `translate(${tx}px, ${ty}px)`,
        transition: 'transform .6s cubic-bezier(.22,.61,.36,1)',
      }}>
        <MapBackdrop mt={mt} />
        {selMember && selMember.track && <Track points={selMember.track} color={TOKENS.people[selMember.hue]} />}
        {members.map(m => (
          <MemberPin key={m.id} m={m} lang={lang} selected={m.id === selectedId} onClick={onSelectMember} />
        ))}
        <div onClick={onSelectSelf} style={{ cursor: 'pointer' }}>
          <SelfMarker heading={heading} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MockMap, MAP_THEMES });
