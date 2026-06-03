// core.jsx — design tokens, i18n dictionary, mock room data, geo helpers
// All UI copy flows through t() so the prototype is i18n-ready (zh / en).

// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────
const TOKENS = {
  self:    'oklch(0.60 0.15 255)',   // 自己 — blue
  selfSoft:'oklch(0.60 0.15 255 / 0.16)',
  target:  'oklch(0.56 0.19 300)',   // 选中目标 — violet
  online:  'oklch(0.68 0.16 150)',   // 在线 — green
  stale:   'oklch(0.74 0.14 75)',    // 位置过期 — amber
  offline: 'oklch(0.68 0.02 250)',   // 离线 — gray
  danger:  'oklch(0.60 0.20 25)',    // 危险 — red
  ink:     'oklch(0.22 0.015 260)',
  inkSoft: 'oklch(0.50 0.02 260)',
  inkFaint:'oklch(0.66 0.015 260)',
  line:    'oklch(0.90 0.008 260)',
  // per-person soft avatar colors — shared chroma/lightness, varied hue
  people:  [200, 150, 30, 320, 95, 265].map(h => `oklch(0.70 0.12 ${h})`),
};

// ─────────────────────────────────────────────────────────────
// i18n
// ─────────────────────────────────────────────────────────────
const STRINGS = {
  zh: {
    appName: 'Zhinzen',
    tagline: '和身边的人，实时互相找到',
    noAccount: '无需注册 · 无需登录 · 这台设备就是你',
    yourName: '你的名字',
    yourColor: '你的颜色',
    leaveRoom: '离开房间',
    namePh: '输入一个显示姓名',
    continue: '继续',
    hi: '你好，{name}',
    pickAction: '创建一个房间，或加入朋友的房间',
    createRoom: '创建房间',
    createRoomSub: '生成邀请链接，叫上你的人',
    joinRoom: '加入房间',
    joinRoomSub: '粘贴邀请链接或房间码',
    joinPh: '邀请链接 或 房间码',
    join: '加入',
    or: '或',
    // map
    you: '你',
    members: '位成员',
    online: '在线',
    offline: '离线',
    stale: '位置已过期',
    moving: '移动中',
    locating: '定位中',
    notSharing: '未共享位置',
    sharingOn: '正在共享位置',
    sharingOff: '已停止共享',
    sharingShort: '共享中',
    pausedShort: '已暂停',
    roomCode: '房间码',
    copyLink: '复制邀请链接',
    copied: '已复制邀请链接',
    recenter: '回到我的位置',
    track: '轨迹',
    stopShare: '停止共享',
    startShare: '开始共享',
    // detail
    away: '相距',
    updated: '{t}前更新',
    now: '刚刚',
    minAgo: '{n} 分钟',
    navigate: '用 Google 地图导航',
    pointMe: '方向指针找人',
    showTrack: '显示对方轨迹',
    hideTrack: '隐藏轨迹',
    uwbReady: 'UWB 可用',
    bleRange: '蓝牙距离',
    compassOff: '方向不可用',
    mayMoved: '对方可能已经移动',
    cantNavStale: '位置已过期，暂时无法导航',
    // finder
    thisWay: '朝这个方向',
    veryClose: '就在附近',
    closing: '正在靠近',
    lowAcc: '精度较低',
    noCompass: '方向不可用 · 仅显示距离',
    holdFlat: '把手机水平举在身前',
    exit: '退出找人',
    // units
    m: '米',
    km: '公里',
  },
  en: {
    appName: 'Zhinzen',
    tagline: 'Find the people right around you, live',
    noAccount: 'No sign-up · No login · This device is you',
    yourName: 'Your name',
    yourColor: 'Your color',
    leaveRoom: 'Leave room',
    namePh: 'Enter a display name',
    continue: 'Continue',
    hi: 'Hi, {name}',
    pickAction: 'Create a room, or join a friend’s',
    createRoom: 'Create a room',
    createRoomSub: 'Get an invite link and call your people',
    joinRoom: 'Join a room',
    joinRoomSub: 'Paste an invite link or room code',
    joinPh: 'Invite link or room code',
    join: 'Join',
    or: 'or',
    you: 'You',
    members: 'members',
    online: 'Online',
    offline: 'Offline',
    stale: 'Location stale',
    moving: 'Moving',
    locating: 'Locating',
    notSharing: 'Not sharing',
    sharingOn: 'Sharing your location',
    sharingOff: 'Sharing paused',
    sharingShort: 'Live',
    pausedShort: 'Paused',
    roomCode: 'Room code',
    copyLink: 'Copy invite link',
    copied: 'Invite link copied',
    recenter: 'Recenter on me',
    track: 'Track',
    stopShare: 'Stop sharing',
    startShare: 'Start sharing',
    away: 'away',
    updated: 'Updated {t} ago',
    now: 'just now',
    minAgo: '{n} min',
    navigate: 'Navigate in Google Maps',
    pointMe: 'Point me to them',
    showTrack: 'Show their track',
    hideTrack: 'Hide track',
    uwbReady: 'UWB ready',
    bleRange: 'Bluetooth range',
    compassOff: 'Compass off',
    mayMoved: 'They may have moved since',
    cantNavStale: 'Location is stale — can’t navigate yet',
    thisWay: 'This way',
    veryClose: 'Very close',
    closing: 'Getting closer',
    lowAcc: 'Low accuracy',
    noCompass: 'Compass unavailable · distance only',
    holdFlat: 'Hold your phone flat in front of you',
    exit: 'Exit',
    m: 'm',
    km: 'km',
  },
};

function makeT(lang) {
  const dict = STRINGS[lang] || STRINGS.zh;
  return (key, vars) => {
    let s = dict[key] != null ? dict[key] : key;
    if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
    return s;
  };
}

// ─────────────────────────────────────────────────────────────
// Geo helpers (pixel world space; ~north = -y)
// ─────────────────────────────────────────────────────────────
const PX_PER_M = 0.75;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const meters = (a, b) => dist(a, b) / PX_PER_M;
function bearing(a, b) { // degrees, 0 = up/north, clockwise
  const ang = Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI;
  return (ang + 360) % 360;
}
function fmtDist(t, m) {
  if (m >= 1000) return { v: (m / 1000).toFixed(1), u: t('km') };
  return { v: Math.round(m).toString(), u: t('m') };
}

// ─────────────────────────────────────────────────────────────
// Mock room — self + members in world coords (origin self at 500,500)
// ─────────────────────────────────────────────────────────────
const SELF = { x: 500, y: 500 };

const MEMBERS = [
  {
    id: 'lin', name: '小林', enName: 'Lin', hue: 0, x: 648, y: 372,
    status: 'moving', sharing: true, last: 0, platform: 'android',
    caps: { compass: true, uwb: false, ble: true },
    track: [[500,500],[546,470],[588,452],[612,420],[648,372]],
  },
  {
    id: 'zhe', name: '阿哲', enName: 'Zhe', hue: 1, x: 372, y: 726,
    status: 'online', sharing: true, last: 0, platform: 'android',
    caps: { compass: true, uwb: true, ble: true },
    track: [[500,500],[470,560],[438,612],[404,668],[372,726]],
  },
  {
    id: 'mika', name: 'Mika', enName: 'Mika', hue: 2, x: 772, y: 566,
    status: 'stale', sharing: true, last: 6, platform: 'ios',
    caps: { compass: true, uwb: false, ble: false }, track: null,
  },
  {
    id: 'yuko', name: '优子', enName: 'Yuko', hue: 3, x: 560, y: 654,
    status: 'online', sharing: true, last: 0, platform: 'web',
    caps: { compass: false, uwb: false, ble: false }, track: null,
  },
  {
    id: 'dashu', name: '大树', enName: 'Oak', hue: 4, x: 300, y: 322,
    status: 'offline', sharing: false, last: 14, platform: 'web',
    caps: { compass: true, uwb: false, ble: false }, track: null,
  },
  {
    id: 'ken', name: 'Ken', enName: 'Ken', hue: 5, x: 716, y: 716,
    status: 'online', sharing: true, last: 0, platform: 'android',
    caps: { compass: true, uwb: true, ble: true }, track: null,
  },
];

function memberName(m, lang) { return lang === 'en' ? m.enName : m.name; }
function initial(s) { return [...s][0]; }

Object.assign(window, {
  TOKENS, STRINGS, makeT, dist, meters, bearing, fmtDist, fmtMeters: fmtDist,
  PX_PER_M, SELF, MEMBERS, memberName, initial,
});
