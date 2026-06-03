// app.jsx — state machine, map screen chrome, tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "lang": "zh",
  "mapTheme": "light",
  "accent": "oklch(0.60 0.15 255)",
  "memberCount": 4
}/*EDITMODE-END*/;

const ACCENTS = [
  'oklch(0.60 0.15 255)', // blue
  'oklch(0.62 0.12 200)', // teal
  'oklch(0.55 0.16 280)', // indigo
  'oklch(0.64 0.13 160)', // green
];

function Toast({ msg, icon }) {
  if (!msg) return null;
  return (
    <div style={{ position: 'absolute', top: 118, left: '50%', transform: 'translateX(-50%)', zIndex: 90, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'oklch(0.22 0.015 260)', color: '#fff', borderRadius: 13, fontFamily: 'var(--sans)', fontSize: 13.5, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', whiteSpace: 'nowrap', animation: 'toastIn .25s ease' }}>
      {icon && <Icon name={icon} size={16} color={TOKENS.online} />}{msg}
    </div>
  );
}

// ── Bottom member strip (collapsed sheet) ────────────────────
function MemberStrip({ t, lang, selfName, members, sharing, onSelect, onSelf }) {
  const onlineN = members.filter(m => m.status !== 'offline').length;
  const me = selfName && selfName.trim() ? selfName : t('you');
  const item = (key, av, name, sub, subColor, onClick) => (
    <button key={key} onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 66, flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
      {av}
      <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 12.5, fontWeight: 600, color: TOKENS.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 66 }}>{name}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: subColor, marginTop: 1 }}>{sub}</div>
      </div>
    </button>
  );
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 12px' }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 700, color: TOKENS.ink, whiteSpace: 'nowrap' }}>
          {members.length + 1} {t('members')} <span style={{ color: TOKENS.online, fontWeight: 600, fontSize: 13 }}>· {onlineN} {t('online')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 11.5, color: sharing ? TOKENS.online : TOKENS.inkFaint, whiteSpace: 'nowrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: sharing ? TOKENS.online : TOKENS.offline, animation: sharing ? 'movingDot 1.6s ease-in-out infinite' : 'none' }} />
          {sharing ? t('sharingShort') : t('pausedShort')}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' }}>
        {item('self',
          <div style={{ width: 44, height: 44, borderRadius: 15, background: TOKENS.self, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontFamily: 'system-ui', fontSize: 17, boxShadow: `0 0 0 2.5px ${TOKENS.selfSoft}` }}>
            {initial(me)}
          </div>,
          me, sharing ? t('sharingShort') : t('pausedShort'), TOKENS.self, onSelf)}
        {members.map(m => {
          const d = fmtDist(t, meters(SELF, m));
          return item(m.id, <Avatar m={m} lang={lang} size={44} />, memberName(m, lang),
            m.status === 'offline' ? t('offline') : `${d.v}${d.u}`,
            m.status === 'offline' ? TOKENS.inkFaint : TOKENS.inkSoft,
            () => onSelect(m.id));
        })}
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const lang = t.lang;
  const tr = makeT(lang);
  // apply accent into shared tokens before children render
  TOKENS.self = t.accent;
  TOKENS.selfSoft = t.accent.replace(')', ' / 0.16)');

  const [phase, setPhase] = React.useState('onboarding'); // onboarding | room | map
  const [name, setName] = React.useState('');
  const [selectedId, setSelectedId] = React.useState(null);
  const [trackId, setTrackId] = React.useState(null);
  const [finderId, setFinderId] = React.useState(null);
  const [selfOpen, setSelfOpen] = React.useState(false);
  const [sharing, setSharing] = React.useState(true);
  const [focus, setFocus] = React.useState(SELF);
  const [toast, setToast] = React.useState(null);

  const count = Math.max(2, Math.min(MEMBERS.length, Math.round(t.memberCount)));
  const members = MEMBERS.slice(0, count);
  const selected = members.find(m => m.id === selectedId) || null;
  const finder = members.find(m => m.id === finderId) || null;
  const heading = 0;

  React.useEffect(() => { // clamp selection if member count shrinks
    if (selectedId && !members.find(m => m.id === selectedId)) { setSelectedId(null); setFocus(SELF); }
    if (trackId && !members.find(m => m.id === trackId)) setTrackId(null);
    if (finderId && !members.find(m => m.id === finderId)) setFinderId(null);
  }, [count]);

  const flash = (msg, icon) => { setToast({ msg, icon }); clearTimeout(window.__tt); window.__tt = setTimeout(() => setToast(null), 1900); };

  const selectMember = (id) => {
    setSelfOpen(false);
    setSelectedId(id);
    const m = MEMBERS.find(x => x.id === id);
    setFocus({ x: (SELF.x + m.x) / 2, y: (SELF.y + m.y) / 2 });
  };
  const openSelf = () => { setSelectedId(null); setSelfOpen(true); setFocus(SELF); };
  const closeDetail = () => { setSelectedId(null); setFocus(SELF); };
  const recenter = () => { setSelectedId(null); setSelfOpen(false); setFocus(SELF); };

  const onContinue = () => setPhase('room');
  const enterMap = () => { setPhase('map'); flash(lang === 'en' ? 'Room created' : '房间已创建', 'check'); };

  // ── pre-map flows ──
  if (phase === 'onboarding')
    return wrapDevice(lang, true, <Onboarding t={tr} lang={lang} name={name} setName={setName} onContinue={onContinue} />, setTweak, t, lang);
  if (phase === 'room')
    return wrapDevice(lang, false, <RoomChoice t={tr} name={name || tr('you')} onCreate={enterMap} onJoin={enterMap} />, setTweak, t, lang);

  // ── map screen ──
  const dark = t.mapTheme === 'dark';
  const screen = (
    <div style={{ position: 'absolute', inset: 0 }}>
      <MockMap theme={t.mapTheme} members={members} selectedId={selectedId} trackId={trackId}
        focus={focus} heading={heading} lang={lang} onSelectMember={selectMember} onSelectSelf={openSelf} />

      {/* top status bar */}
      <div style={{ position: 'absolute', top: 56, left: 12, right: 12, zIndex: 40, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, height: 46, padding: '0 14px', borderRadius: 15, background: dark ? 'rgba(30,32,38,0.8)' : 'rgba(255,255,255,0.9)', backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', color: dark ? '#fff' : TOKENS.ink }}>
          <Icon name="people" size={18} color={dark ? '#fff' : TOKENS.inkSoft} />
          <span style={{ fontFamily: 'var(--sans)', fontSize: 14, fontWeight: 650 }}>{members.filter(m => m.status !== 'offline').length + 1}</span>
          <span style={{ width: 1, height: 18, background: dark ? 'rgba(255,255,255,0.18)' : TOKENS.line, margin: '0 2px' }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, letterSpacing: '0.08em', color: dark ? 'rgba(255,255,255,0.8)' : TOKENS.inkSoft, whiteSpace: 'nowrap' }}>R-7K2Q</span>
        </div>
        <button onClick={() => flash(tr('copied'), 'check')} style={{ height: 46, padding: '0 14px', borderRadius: 15, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, background: TOKENS.self, color: '#fff', fontFamily: 'var(--sans)', fontSize: 13.5, fontWeight: 600, boxShadow: '0 4px 14px rgba(0,0,0,0.16)' }}>
          <Icon name="copy" size={17} />{lang === 'en' ? 'Invite' : '邀请'}
        </button>
      </div>

      {/* right FAB column */}
      <div style={{ position: 'absolute', right: 12, bottom: selected ? 520 : selfOpen ? 450 : 232, zIndex: 40, display: 'flex', flexDirection: 'column', gap: 10, transition: 'bottom .4s cubic-bezier(.22,.61,.36,1)' }}>
        <FabButton icon={sharing ? 'pause' : 'play'} active={!sharing} dark={dark} label="share"
          onClick={() => { setSharing(s => !s); flash(sharing ? (lang === 'en' ? 'Sharing paused' : '已停止共享') : (lang === 'en' ? 'Sharing on' : '已开始共享'), sharing ? null : 'check'); }} />
        <FabButton icon="recenter" dark={dark} label="recenter" onClick={recenter} />
      </div>

      {/* bottom sheet */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 45, background: dark ? 'oklch(0.20 0.012 255)' : '#fff', borderRadius: '26px 26px 0 0', boxShadow: '0 -8px 30px rgba(0,0,0,0.14)', padding: '10px 18px 30px', maxHeight: 560, color: dark ? '#fff' : TOKENS.ink }}>
        <div style={{ width: 38, height: 5, borderRadius: 3, background: dark ? 'rgba(255,255,255,0.2)' : 'oklch(0.88 0.008 260)', margin: '0 auto 14px' }} />
        {selected
          ? <MemberDetail t={tr} lang={lang} m={selected} heading={heading} trackOn={trackId === selected.id}
              onClose={closeDetail}
              onToggleTrack={() => setTrackId(id => id === selected.id ? null : selected.id)}
              onNavigate={() => flash(lang === 'en' ? 'Opening Google Maps…' : '正在打开 Google 地图…', 'nav')}
              onFinder={() => setFinderId(selected.id)} />
          : selfOpen
          ? <SelfDetail t={tr} lang={lang} name={name} setName={setName} accent={t.accent} accents={ACCENTS}
              onPickColor={v => setTweak('accent', v)} sharing={sharing}
              onToggleShare={() => { setSharing(s => !s); flash(sharing ? (lang === 'en' ? 'Sharing paused' : '已停止共享') : (lang === 'en' ? 'Sharing on' : '已开始共享'), sharing ? null : 'check'); }}
              onClose={() => setSelfOpen(false)}
              onLeave={() => { setSelfOpen(false); setSelectedId(null); setTrackId(null); setFinderId(null); setFocus(SELF); setPhase('room'); }} />
          : <MemberStrip t={tr} lang={lang} selfName={name} members={members} sharing={sharing} onSelect={selectMember} onSelf={openSelf} />}
      </div>

      <Toast msg={toast?.msg} icon={toast?.icon} />
      {finder && <Finder t={tr} lang={lang} m={finder} heading={heading} onExit={() => setFinderId(null)} />}
    </div>
  );

  return wrapDevice(lang, dark, screen, setTweak, t, lang);
}

// device + tweaks wrapper
function wrapDevice(_lang, dark, content, setTweak, t, lang) {
  return (
    <React.Fragment>
      <IOSDevice dark={dark}>{content}</IOSDevice>
      <TweaksPanel>
        <TweakSection label={lang === 'en' ? 'Language (i18n)' : '语言（i18n）'} />
        <TweakRadio label={lang === 'en' ? 'Language' : '界面语言'} value={t.lang} options={['zh', 'en']} onChange={v => setTweak('lang', v)} />
        <TweakSection label={lang === 'en' ? 'Map & color' : '地图与配色'} />
        <TweakRadio label={lang === 'en' ? 'Map theme' : '地图主题'} value={t.mapTheme} options={['light', 'dark']} onChange={v => setTweak('mapTheme', v)} />
        <TweakColor label={lang === 'en' ? 'Your accent' : '自己强调色'} value={t.accent} options={ACCENTS} onChange={v => setTweak('accent', v)} />
        <TweakSection label={lang === 'en' ? 'Room' : '房间'} />
        <TweakSlider label={lang === 'en' ? 'Members' : '房间人数'} value={t.memberCount} min={2} max={6} step={1} onChange={v => setTweak('memberCount', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
