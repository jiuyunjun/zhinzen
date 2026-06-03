# 工作日志 / Worklog

> 面向多 agent 协作的交接记录。每完成一项工作，在最上方追加一条带日期的条目，
> 说明：做了什么、关键决策、改动的文件、还剩什么 / 下一步。最新在最上面。

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
