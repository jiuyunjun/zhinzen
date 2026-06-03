# 工作日志 / Worklog

> 面向多 agent 协作的交接记录。每完成一项工作，在最上方追加一条带日期的条目，
> 说明：做了什么、关键决策、改动的文件、还剩什么 / 下一步。最新在最上面。

---

## 2026-06-03 — Phase 2 准备 / 交接（环境配置）⏳ 进行中

**已完成（commit `a160393`）**
- 用户在根目录放了 `env.local`（无前导点、含**真实 Maps key**），该文件名**不被 .gitignore
  覆盖**、差点泄露。已改名为 `.env.local`（Vite 约定 + 被 `.gitignore` 的 `.env.*` 忽略），
  变量名改为 `VITE_MAPS_API_KEY`（Vite 仅暴露 `VITE_` 前缀给前端），删除旧 `env.local`。
- `apps/web/vite.config.ts`：`envDir: '../..'`，从仓库根加载 `.env.local`。
- `.env.example`（已提交，占位）：`VITE_MAPS_API_KEY` + 7 个 `VITE_FIREBASE_*`。
- `apps/web/src/lib/env.ts`：typed 读取（`mapsApiKey`、`firebaseConfig`、
  `isFirebaseConfigured()`、`isMapsConfigured()`）。`apps/web/src/vite-env.d.ts`：给自定义
  `VITE_*` 加类型。`npm run build` 通过。

**⚠️ 下一个 agent 必须先提醒/确认用户的安全事项**
- Maps JS API key 必然进前端打包产物（藏不住）。真正防护：GCP 控制台给该 key 加
  **HTTP 引荐来源限制**（localhost:5173/* + 部署域名）+ **API 限制只勾 Maps JavaScript API**。
  该 key 曾以明文落盘并发给过 agent，建议轮换或确认限制到位。**它没进 git 历史。**
- 真实 `.env.local` 的值只在用户本地；仓库里只有 `.env.example` 占位。

**Phase 2 开始前的阻塞项（需用户提供 / 决策 —— 我提问时被打断，问题如下）**
1. **Firebase web 配置**：用户已建 Firebase 项目（名 “Zhinzen”，**确切 projectId 待确认**）。
   需要从控制台「项目设置 → 常规 → 你的应用(Web) → SDK config」拿到并填入 `.env.local`：
   `apiKey / authDomain / projectId / storageBucket / messagingSenderId / appId / databaseURL`
   （对应 7 个 `VITE_FIREBASE_*`）。Firebase web `apiKey` 非机密，靠 Rules + App Check 保护。
2. **Realtime Database 是否已开启**（design 用 RTDB 存实时位置 `liveLocations/{roomId}/{deviceId}`，
   需要 `databaseURL`）。若没开：控制台 → 构建 → Realtime Database → 创建数据库 → 选区域。
3. **环境选择**：建议 **先用 Firebase Emulator Suite** 跑通逻辑（需本机 `firebase-tools`），
   验证后再切真实项目；或直接连真实项目。`firebase/firebase.json` 已配好 emulators 端口。
   还需创建 `.firebaserc`（写 projectId，确认后再建）。

**Phase 2 实施清单（design.md §16 Phase 2 + agents.md §16）**
- 装 `firebase` Web SDK 到 `apps/web`；新建 `apps/web/src/lib/firebase.ts` 用 `env.ts` 的
  `firebaseConfig` 初始化 app / firestore / database（emulator 模式下 connect emulators）。
- 写 Cloud Functions：`createRoom`（高熵 roomId+过期+creator deviceSession）、`joinRoom`
  （容量/过期校验 + deviceSession）—— 见 `firebase/functions/src/index.ts` 里已列的 TODO。
- 把 `state/roomStore.ts` 的 `createRoom/joinRoom/leaveRoom` 从本地实现换成调用上述后端
  （接口名不变，原地替换）；`deviceStore` 的 deviceSecret 用于写校验证明。
- 位置：请求 Geolocation 权限 → 获取融合定位 → 按 design §4.4 频率上传到 RTDB
  `liveLocations/{roomId}/{deviceId}`；监听房间成员（Firestore `rooms/{roomId}/members`）与
  实时位置。新增 `locationStore` / `membersStore`（design §14 的 locationState/membersState）。
- 地图：接 **Google Maps JavaScript API**（用 `mapsApiKey`），把 `MapScreen` 的占位面换成
  真实地图，渲染自己 + 其他成员图钉（颜色用 `shared-ui` 的 `peopleColors`），成员条显示真实
  距离（`geo-utils.calculateDistance`/`formatDistance`）与状态（`isLocationStale`）。
- 收紧 `firebase/firestore.rules` 与 `database.rules.json` 里的 `TODO(phase-2)`（deviceSession
  校验）。用 emulator 验证创建/加入/上传/监听全链路。

---

## 2026-06-03 — Phase 1：Web MVP 骨架 ✅（无后端）

**做了什么**
把 `apps/web` 从 Phase 0 占位页换成真实的 **onboarding → room → map** 流程骨架，对照
`docs/ui/prototype` 重建视觉，全程走设计 token 与 i18n。**本阶段不接后端**（创建/加入房间
只改本地状态 + URL hash），真正的 Firebase / 实时成员留给 Phase 2。

**新增结构（apps/web/src）**
- `lib/deviceIdentity.ts`：设备即用户 —— 首次启动用 `crypto.randomUUID()` + 32 字节随机
  生成 `deviceId`/`deviceSecret`，存 localStorage（`zhinzen.device.v1`），后续复用；
  `displayName` 可改。secret 永不展示/上报（design.md §2.2）。
- `lib/roomCode.ts`：高熵房间码（Crockford base32，10 位 ≈50 bit），`generateRoomId`/
  `formatRoomCode`(分组显示)/`inviteLink`(`#/r/CODE`)/`parseRoomInput`(链接或码)/`roomFromUrl`。
- `i18n/`：zh/en 字典 + `makeT()`（`{var}` 插值）+ `detectLang()`（中文优先）。
- `state/`（Zustand，对应 design.md §14 分区）：`deviceStore`(身份)、`roomStore`(roomId +
  sharing + 创建/加入/离开)、`uiStore`(语言 + 绑定的 t)。
- `components/`：`Icon`(几何图标集)、`Wordmark`、`PrimaryButton`、`LangToggle`(中/EN 切换，
  替代原型的 Tweaks 语言控件)、`Toast`(+`useToast`)。
- `features/`：`onboarding/Onboarding`(姓名输入)、`room/RoomChoice`(创建/加入 + 邀请码输入)、
  `map/MapScreen`(顶栏 房间码+邀请复制 / 占位地图+自己标记 / 共享开关 FAB + recenter /
  底部成员条 + 离开房间)、`map/MemberStrip`(仅自己，成员计数暂硬编码为 1)。
- `App.tsx`：阶段路由（按持久化姓名 + URL 邀请链接推导入口）。`index.css` 加了
  `zzSelfPulse`/`zzToastIn` keyframes。去掉了原型里的 iOS 设备外壳 —— 真机 Web 全屏布局。

**关键决策**
- 不引入路由库：邀请链接走 URL hash（`#/r/CODE`），免服务端路由配置；打开即解析。
- 房间码本身即 join 标识（链接与码一致、可输入），骨架阶段无后端校验，已在代码注释标明
  Phase 2 接入真实房间记录（容量/过期/deviceSession）。
- 创建/加入/离开都通过 store 的同名 action，Phase 2 可原地替换为 Firebase 实现。
- 地图先用占位面（paper 底 + 脉冲自己点 + 「下一阶段接 Google 地图」提示），不引 Maps SDK
  （需 API key，属 Phase 2/3）。recenter FAB 暂为占位反馈。

**验证**
- `npm run build`（web：tsc --noEmit + vite build）通过。流程：首启 onboarding → 命名 →
  room → 创建/加入 → map；离开回 room；带 `#/r/CODE` 打开且已命名则直达 map。

**下一步：Phase 2 — 实时位置**
1. 接 Firebase（Web SDK + 真实项目配置/env），用 emulator 先跑通。
2. roomStore/createRoom/joinRoom 换成真实房间记录 + deviceSession（写 Cloud Function）。
3. 位置权限请求 + 获取融合定位 + 定期上传到 RTDB `liveLocations/{roomId}/{deviceId}`。
4. 监听房间成员与实时位置，地图显示其他人（此时接 Google Maps），成员条显示真实距离/状态。
5. 在线/离线/过期状态（用 geo-utils 的 `isLocationStale`），收紧 Firestore/RTDB 规则的
   `TODO(phase-2)`。

---

## 2026-06-03 — Phase 0：项目初始化 ✅

**做了什么**
搭好整个 monorepo 脚手架，让后续 Phase 1 可以直接开始写功能。原本散落在仓库根目录的
设计原型移入 `docs/ui/prototype/` 作为视觉参考。

**仓库结构（新建）**
- 根 `package.json`：npm workspaces（`packages/*` + `apps/web`），脚本 `dev/build/typecheck/lint`。
- `tsconfig.base.json`：共享严格 TS 配置。
- `README.md`、`.gitignore`（补充 node_modules / dist / .env / firebase 产物）。

**packages/**
- `@zhinzen/shared-types`：数据模型，严格对齐 design.md §6.2 —— `Room`、`RoomMember`
  (+`DeviceCapabilities`)、`LiveLocation`、`TrackPoint`、`DeviceIdentity`、`DeviceSession`，
  以及 `LatLng` / `Platform` / `MemberStatus` 等。**时间统一用 epoch 毫秒 `number`**，
  不耦合 Firebase 类型（web/android/ios/functions 通用）。
- `@zhinzen/geo-utils`：design.md §13 的纯函数 —— `calculateDistance`(haversine)、
  `calculateBearing`、`normalizeAngle`、`calculateRelativeDirection`、`isLocationStale`、
  `isAccuracyPoor`、`simplifyTrack`(Ramer–Douglas–Peucker)、外加 `formatDistance`(§5.6)。
  阈值集中在 `constants.ts`（`DEFAULT_STALE_MS` 等，均为 MVP 默认，对应 §17 待确认项）。
- `@zhinzen/shared-ui`：从原型抽取的设计 token —— `color`/`peopleColors`/`accentChoices`/
  `font`/`mapThemes`/`statusColor`/`withAlpha`（TS），以及 `tokens.css`（CSS 变量镜像）。

**apps/web**
- Vite + React 18 + TS 脚手架，端口 5173。`index.html` 预接 Google Fonts。
- `App.tsx` 是 Phase 0 占位页：刻意从三个 workspace 包各引一个符号（类型 + 几何 +
  token），渲染成功即证明 monorepo 接线打通。**Phase 1 用真实 onboarding→room→map 流程替换它。**

**firebase/**
- `firebase.json`：firestore / database / functions / hosting(指向 apps/web/dist) / emulators。
- `firestore.rules` + `database.rules.json`：**v0 baseline，非生产级安全**。采用 capability-URL
  模型（知道高熵 roomId 即可读）。写入做了结构校验但 deviceId 归属无法仅靠规则证明 ——
  文件内用 `TODO(phase-N)` 标注了需由 Cloud Functions + App Check 补强之处（design.md §15）。
- `functions/`：独立部署的 TS 脚手架（不在根 workspace 内），目前只有 `health` 探针；
  计划中的 `createRoom/joinRoom/cleanupExpired/verifyWrite` 已在 `src/index.ts` 注释列出。

**文档**
- `docs/ui/prototype/`：原型 + 说明 README（含核心闭环与文件清单）。
- `docs/api/`、`docs/firebase/`：占位 README。
- 本 `docs/WORKLOG.md`：交接日志（本条）。

**关键决策**
- 包管理用 **npm workspaces**（环境无 pnpm）。
- workspace 包直接以 TS 源码（`main: src/index.ts`）被 web 消费，Vite/esbuild 编译，
  省去单独的包构建步骤。
- Functions 故意排除在根 workspace 之外，避免 firebase-admin/functions 依赖与前端纠缠。
- 安全规则诚实标注为 v0、未硬化，避免误判为生产安全。

**验证**
- `npm install` 成功；`npm run typecheck`（全 workspace）通过；`npm run build`（web）通过。
  （functions 依赖独立安装，未纳入本次根验证。）

**下一步：Phase 1 — Web MVP 骨架**
1. 设备初始化：本地生成并持久化 `deviceId` + `deviceSecret`（localStorage），暴露为 store。
2. 姓名输入页（对照原型 Onboarding）。
3. 创建 / 加入房间页（对照原型 RoomChoice），先用本地 mock，再接 Firebase。
4. 地图主页骨架 + 底部成员列表骨架。
5. 选状态管理（design.md §7.1 建议 Zustand）并落地 §14 的 state 分区。
6. 接 Firebase 真实后端前，先用 emulator 跑通创建/加入房间与 deviceSession。
