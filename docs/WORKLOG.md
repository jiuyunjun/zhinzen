# 工作日志 / Worklog

> 面向多 agent 协作的交接记录。每完成一项工作，在最上方追加一条带日期的条目，
> 说明：做了什么、关键决策、改动的文件、还剩什么 / 下一步。最新在最上面。

---

## 2026-06-03 — 地图抖动与离开房间入口调整 ✅

**做了什么**
- 移除底部 sheet 常驻的“离开房间”按钮，减少主界面占用空间。
- “离开房间”现在只在点击自己的成员图标、打开“你”的详情面板后显示。
- Google Map 不再在每次实时位置更新后自动 `panTo`。
- 地图只在首次拿到有效图钉时自动适配视野。
- 点击“回到我的位置”按钮时才主动移动地图中心。

**验证**
- `npm run build` 通过。
- Vite 仍提示主 bundle 超过 500KB，后续应单独做 Firebase 代码拆分。

**下一步**
1. 真机确认位置刷新时地图不再抖动。
2. 观察底部 sheet 高度是否更适合手机屏幕。

---

## 2026-06-03 — Phase 4 Task 1：Web 方向指针基础 ✅

**做了什么**
- 新增 `apps/web/src/state/sensorStore.ts`。
- 监听 Web `deviceorientationabsolute` / `deviceorientation`，提取设备朝向。
- 支持 iOS Safari 的 `DeviceOrientationEvent.requestPermission()`。
- 点击开启共享或选中成员时尝试启动罗盘监听。
- 成员详情面板增加方向指针：
  - 根据自己的位置和目标位置计算目标方位角。
  - 根据设备朝向计算屏幕箭头旋转角。
  - 罗盘不可用时显示“方向不可用，仅显示距离”。
- i18n 增加方向和罗盘不可用文案。

**验证**
- `npm run build` 通过。
- Vite 仍提示主 bundle 超过 500KB，后续应单独做 Firebase 代码拆分。

**注意**
- Web 罗盘数据依赖浏览器和设备，Android Chrome 通常更容易拿到；iOS Safari 需要用户手势授权。
- 当前只做基础指向，后续需要真机调校抖动和平滑。

**下一步**
1. 真机验证 Android Chrome / iOS Safari 罗盘授权和箭头方向。
2. 增加方向数据平滑，减少抖动。
3. 将方向状态同步到成员条或独立方向模式。

---

## 2026-06-03 — Hosting 根目录部署配置 ✅

**做了什么**
- 新增根目录 `firebase.json`，用于从仓库根目录部署 Firebase。
- Hosting public 路径改为仓库根相对路径：
  - `apps/web/dist`
- Firestore、RTDB、Functions 路径也在根配置中改为仓库根相对路径。

**原因**
- 从 `firebase/` 子目录部署 Hosting 时，Firebase CLI 拒绝 `../apps/web/dist`，提示 public
  目录在项目目录之外。

**下一步**
1. 使用根目录 `firebase.json` 部署 Hosting。

---

## 2026-06-03 — Phase 3 Task 4：前端轨迹读取与地图绘制 ✅

**做了什么**
- `trackApi` 增加 `fetchRecentTrackPoints`，按设备读取最近 24 小时轨迹：
  - `rooms/{roomId}/tracks/{deviceId}/points`
  - `where createdAt >= now - 24h`
  - `orderBy createdAt asc`
- `MapScreen` 默认读取自己的轨迹。
- 点击成员后切换读取该成员轨迹。
- 轨迹读取每 15 秒刷新一次，便于 HTTPS 真机测试时看到新点追加。
- `GoogleMapView` 在 Google Map 上绘制轨迹线段。
- 轨迹线按相邻点平均速度做红到绿的线性颜色表达：
  - 停留 / 极慢偏红。
  - 慢速偏橙。
  - 中速偏黄绿。
  - 快速偏绿。

**验证**
- `npm run build` 通过。
- Vite 仍提示主 bundle 超过 500KB，后续应单独做 Firebase 代码拆分。

**下一步**
1. 部署 Firebase Hosting，提供 HTTPS 测试地址。
2. 真机测试位置权限、RTDB 实时点、Firestore 轨迹点和轨迹线。
3. 根据真机结果调整轨迹采样频率和线段颜色阈值。

---

## 2026-06-03 — Phase 3 Task 3：前端轨迹点写入 ✅

**做了什么**
- 新增 `apps/web/src/lib/trackApi.ts`，封装 callable function：
  - `appendTrackPoint`
- `locationStore` 在位置共享开启时继续每 3 秒写 RTDB 实时位置：
  - `liveLocations/{roomId}/{deviceId}`
- 同一条定位 watcher 现在每 12 秒通过 Cloud Functions 写一次自己的 Firestore 轨迹点。
- 轨迹写入携带：
  - `roomId`
  - `deviceId`
  - `deviceSecret`
  - 经纬度、精度、方向、速度、时间
- `MapScreen` 从 `deviceStore` 读取 `deviceSecret` 并传入位置共享流程。

**关键决策**
- 实时位置和轨迹写入分开节流：
  - 实时位置：3 秒。
  - 轨迹点：12 秒。
- 轨迹写入失败不会停止实时位置共享，避免短暂 Functions/Firestore 问题影响地图当前位置。

**验证**
- `npm run build` 通过。
- Vite 仍提示主 bundle 超过 500KB，后续应单独做 Firebase 代码拆分。

**下一步**
1. 前端读取选中成员最近 24 小时轨迹。
2. 在 Google Map 上显示轨迹线。
3. 按速度对轨迹线段做红到绿的线性颜色表达。

---

## 2026-06-03 — Phase 3 Task 2：轨迹写入后端接口 ✅

**做了什么**
- 新增 Cloud Function：
  - `appendTrackPoint`
- `appendTrackPoint` 校验：
  - 房间存在
  - 房间 `status` 为 `active`
  - 房间未过期
  - `deviceSessions/{deviceId}` 存在
  - `sha256(roomId:deviceId:deviceSecret)` 与 session 中的 `secretHash` 匹配
- 轨迹点写入路径：
  - `rooms/{roomId}/tracks/{deviceId}/points/{pointId}`
- 新轨迹点包含：
  - `lat`
  - `lng`
  - `accuracy`
  - `heading`
  - `speed`
  - `createdAt`
  - `expiresAt`
  - `segmentKind`
- `segmentKind` 按速度派生：
  - `stopped`
  - `slow`
  - `moving`
  - `fast`
- 新房间默认 `trackRetentionMinutes` 从 `120` 改为 `1440`。
- Firestore rules 已改为禁止前端直接写 `tracks`，轨迹写入必须走 Cloud Functions。
- `TrackPoint` shared type 增加 `expiresAt` 和 `segmentKind`。

**部署**
- 已部署：
  - `appendTrackPoint(us-central1)`
  - `createRoom(us-central1)`
  - `joinRoom(us-central1)`
- 已部署 Firestore rules。

**验证**
- `npm run build` 通过。
- `firebase/functions` 的 `npm run build` 通过。
- 使用 Firebase Web SDK 创建临时房间成功，新房间返回 `trackRetentionMinutes: 1440`。
- 调用 `appendTrackPoint` 成功写入轨迹点。
- 尝试用前端 SDK 直接写 Firestore tracks 被 rules 拒绝，返回 `PERMISSION_DENIED`。
- 已删除验证产生的临时 Firestore 房间及其子集合。

**注意**
- Firebase CLI 继续提示 Node.js 20 runtime 已弃用，需要后续单独升级 Functions runtime。
- 当前还没有把前端位置上传流程接到 `appendTrackPoint`。

**下一步**
1. 前端新增 `trackApi.appendTrackPoint`。
2. `locationStore` 在共享位置时按较低频率写自己的轨迹点。
3. 点击成员后读取并显示最近 24 小时轨迹。

---

## 2026-06-03 — 轨迹与实时数据生命周期决策 ✅

**做了什么**
- 更新 `design.md`，明确轨迹和实时位置分层：
  - RTDB `liveLocations/{roomId}/{deviceId}` 只保存当前实时位置。
  - Firestore `rooms/{roomId}/tracks/{deviceId}/points/{pointId}` 保存轨迹点。
- 明确轨迹读取方式：
  - 不全房间实时监听轨迹。
  - 点击特定成员后，按需读取该成员最近 24 小时轨迹。
- 明确轨迹写入方式：
  - 前端不直接写 Firestore tracks。
  - 通过 Cloud Functions 校验 `roomId + deviceId + deviceSecret` 后写入自己的轨迹点。
- 明确轨迹线视觉：
  - 停留 / 极慢使用红色系。
  - 快速移动使用绿色系。
  - 中间速度按线性颜色渐变。
- 明确 RTDB 生命周期：
  - MVP 房间有效期 24 小时。
  - `liveLocations/{roomId}` 从房间创建起最多保留 24 小时。
  - 房间过期后由后端清理对应 RTDB 实时位置数据。

**关键决策**
- RTDB 负责低延迟当前位置。
- Firestore 负责按需查询的 24 小时轨迹历史。
- RTDB 没有内建 TTL，本项目需要通过 Cloud Functions 定时清理过期房间实时数据。

**下一步**
1. 实现 `appendTrackPoint` Cloud Function。
2. 前端位置上传时按较低频率同步写轨迹点。
3. 点击成员后读取并显示该成员最近 24 小时轨迹。

---

## 2026-06-03 — Phase 3 Task 1：成员详情、距离与导航 ✅

**做了什么**
- 新增 `apps/web/src/features/map/MemberDetailPanel.tsx`。
- 成员条 `MemberStrip` 支持点击成员并显示选中态。
- 地图图钉支持点击选中成员，并用更大的图钉描边表达选中态。
- `MapScreen` 管理 `selectedDeviceId`，在底部 sheet 中展示成员详情。
- 成员详情显示：
  - 显示名
  - 在线 / 离线 / 位置过期 / 未共享状态
  - 当前设备到目标的距离
  - 对方最后更新时间
  - Google Maps 导航按钮
- 对方位置过期或未共享时禁用导航，避免跳到不可信位置。
- i18n 增加距离、最后更新时间、导航、未知位置等中英文文案。

**验证**
- `npm run build` 通过。
- Vite 仍提示主 bundle 超过 500KB，后续应单独做 Firebase 代码拆分。

**下一步**
1. 记录自己的轨迹点到 Firestore。
2. 显示自己的轨迹和选中成员轨迹。
3. 增加方向指针所需的方位角 / 罗盘状态。

---

## 2026-06-03 — Phase 2 Task 6：Google Maps 地图与实时图钉 ✅

**做了什么**
- 新增 `apps/web/src/lib/googleMaps.ts`，按需加载 Google Maps JavaScript API。
- 新增 `apps/web/src/features/map/GoogleMapView.tsx`。
- 用真实 Google Map 替换 `MapScreen` 里的占位地图。
- 地图显示：
  - 当前设备定位图钉
  - RTDB 中有实时位置的成员图钉
  - 在线、离线、位置过期状态的不同透明度 / 颜色表达
- `recenter` 按钮现在会让地图回到自己的实时位置，若自己还没有位置则回到第一个可用成员位置。
- 增加 Google Maps 加载中、缺少 API key、加载失败的中英文字段。
- 给 web workspace 增加 `@types/google.maps`，让 TypeScript 能识别 `google.maps` 全局类型。

**验证**
- `npm run build` 通过。
- Vite 仍提示主 bundle 超过 500KB；当前主要是 Firebase SDK，Google Maps 是运行时脚本加载，
  没有直接进入 Vite bundle。

**注意**
- 本次只完成地图和图钉；点击成员后的详情面板、距离、Google Maps 导航和轨迹显示尚未实现。
- 需要在真实浏览器中确认 Maps API key 的 HTTP referrer 限制不会阻止 `localhost:5173`。

**下一步**
1. 在成员条点击成员，打开成员详情面板。
2. 计算自己到目标成员的距离，并在成员条 / 详情面板显示。
3. 增加 Google Maps 导航跳转。

---

## 2026-06-03 — Phase 2 Task 5：成员监听与真实成员条 ✅

**做了什么**
- 新增 `apps/web/src/state/membersStore.ts`。
- 监听 Firestore：
  - `rooms/{roomId}/members`
- 监听 RTDB：
  - `liveLocations/{roomId}`
- 将成员文档和实时位置合并为 `MemberView`：
  - `online`
  - `offline`
  - `stale`
  - `notSharing`
- `MapScreen` 开始监听当前房间成员，并在离开页面时停止监听。
- 顶部成员计数从硬编码 `1` 改为真实成员数。
- `MemberStrip` 从只显示自己，改为显示真实成员列表；自己排第一，在线成员优先。
- i18n 增加离线、位置过期、未共享状态文案。

**规则 / 部署**
- 已部署 Firestore rules：
  - `firebase deploy --only firestore:rules --project zhinzen`
- RTDB 是非默认实例 `zhinzen-live`，`firebase deploy --only database` 会查找默认实例并失败。
- 已通过 RTDB REST settings API 发布 `database.rules.json` 到 `zhinzen-live`。
- 已用 `firebase database:get /.settings/rules --instance zhinzen-live --project zhinzen --pretty`
  验证 RTDB rules 生效。
- `database.rules.json` 移除顶层说明字段，只保留 `"rules"`，以符合 RTDB settings API。
- `firebase/firebase.json` 显式记录 RTDB instance 为 `zhinzen-live`，但当前 CLI deploy 仍不能直接用于
  非默认实例规则发布；后续继续使用 `database:get/set --instance` 或 REST API。

**验证**
- `npm run build` 通过。
- 未认证 REST `PUT` 写入 `liveLocations/RESTROOM/rest-test-device` 成功，验证 v0 匿名客户端可写
  RTDB 实时位置节点。
- 已清理本次和上次验证产生的临时 RTDB 数据，`firebase database:get /liveLocations --instance
  zhinzen-live --project zhinzen --pretty` 返回 `null`。
- Vite 提示主 bundle 超过 500KB；原因主要是 Firebase SDK 已进入前端 bundle，后续接 Google Maps
  前建议做代码拆分。

**下一步**
1. 在两个浏览器窗口或两台设备中创建/加入同一房间，验证成员条和在线/过期/未共享状态。
2. 将地图占位面替换为 Google Maps，并显示自己/其他成员图钉。

---

## 2026-06-03 — Phase 2 Task 4：自己的实时位置上传 ✅

**做了什么**
- 新增 `apps/web/src/lib/locationApi.ts`：
  - `writeLiveLocation(roomId, location)`
  - `clearLiveLocation(roomId, deviceId)`
  - RTDB 路径统一为 `liveLocations/{roomId}/{deviceId}`。
- 新增 `apps/web/src/state/locationStore.ts`：
  - `startSharing`
  - `stopSharing`
  - `status`
  - `permission`
  - `current`
  - `error`
- 使用 `navigator.geolocation.watchPosition` 获取系统融合定位结果。
- 共享开启时上传自己的 `LiveLocation` 到 RTDB。
- 最小上传间隔：3 秒。
- 共享关闭或离开地图页面时停止 watcher，并写入一次 `sharingLocation: false`。
- 如果定位权限被拒绝或定位不可用，自动关闭 UI 的共享状态，避免界面显示“共享中”但实际未上传。
- `MapScreen` 增加定位开始、权限拒绝、定位不可用的 toast。

**验证**
- `npm run build` 通过。

**下一步**
1. 在真实手机浏览器手动验证位置权限与 RTDB 写入。
2. 新增 `membersStore`，监听 Firestore 成员列表和 RTDB liveLocations。
3. 成员条从硬编码 1 人切到真实成员状态。

---

## 2026-06-03 — Phase 2 Task 3：前端房间流程接后端 ✅

**做了什么**
- 新增 `apps/web/src/lib/roomApi.ts`，封装 callable functions：
  - `createRoom`
  - `joinRoom`
- 将 `state/roomStore.ts` 从本地 mock 切换为异步后端调用。
- `roomStore` 新增：
  - `pendingJoinCode`
  - `busy`
  - `error`
  - `clearError`
- 邀请链接打开后不再直接进入地图，而是先带着房间码进入加入流程，由后端校验房间是否存在、
  是否过期、是否满员、设备 session 是否匹配。
- `RoomChoice` 增加创建/加入中的禁用状态和错误提示。
- i18n 增加后端房间错误文案。

**部署**
- 已部署 Cloud Functions 到 `zhinzen`：
  - `createRoom(us-central1)`
  - `joinRoom(us-central1)`
  - `health(us-central1)`
- 首次全量部署时 `createRoom` 因 Cloud Run service 缺失进入失败状态；随后用
  `firebase deploy --only functions:createRoom --project zhinzen --force` 重试成功。
- `createRoom` 重试成功后缺少匿名调用权限，已用 `gcloud run services add-iam-policy-binding`
  给 `createroom` 补充 `roles/run.invoker` / `allUsers`。
- 已让 Firebase CLI 自动配置 `us-central1` 的 Functions artifact cleanup policy：
  1 天以上镜像自动删除。

**验证**
- `npm run build` 通过。
- `firebase deploy --only functions:createRoom --project zhinzen --force` 成功。
- `health` HTTP 调用返回 200。
- 使用 Firebase Web SDK 调用 `createRoom` 成功。
- 使用 Firebase Web SDK 调用 `joinRoom` 成功。
- 已删除验证产生的临时 Firestore 房间 `Q778RPF5G3` 及其子集合。

**注意**
- Firebase CLI 提示 Node.js 20 runtime 已在 2026-04-30 弃用，并将在 2026-10-30 停止部署；
  后续应单独升级 Functions runtime（优先评估 Node.js 22）和 `firebase-functions` 版本。

**下一步**
1. 手动在前端创建房间，确认 Firestore 中出现 `rooms/{roomId}`。
2. 接入 Geolocation 与 RTDB 实时位置上传。

---

## 2026-06-03 — Phase 2 Task 2：Cloud Functions 房间接口 ✅

**做了什么**
- 实现 callable functions：
  - `createRoom`
  - `joinRoom`
- `createRoom` 会生成 10 位 Crockford base32 高熵 `roomId`，创建：
  - `rooms/{roomId}`
  - `rooms/{roomId}/members/{deviceId}`
  - `rooms/{roomId}/deviceSessions/{deviceId}`
- `joinRoom` 会校验：
  - 房间存在
  - 房间 `status` 为 `active`
  - 房间未过期
  - 成员数未超过 `maxMembers`
  - 同一 `deviceId` 的 `deviceSecret` hash 必须匹配已有 session
- `deviceSecret` 不明文保存，只保存 `sha256(roomId:deviceId:deviceSecret)`。
- 给 `firebase/functions` 生成并提交独立 `package-lock.json`。
- 将 `firebase-admin` 升级到 `^13.10.0`，验证当前实现仍可构建。

**默认值**
- 房间有效期：24 小时。
- 最大成员数：20。
- 轨迹保留：120 分钟。
- 默认平台：`web`。
- 默认能力：`location/imu/compass/uwb/ble` 均为 `false`，后续由前端/位置能力检测更新。

**验证**
- `npm run build`（`firebase/functions`）通过。
- `npm audit --omit=dev` 仍有 Firebase/Google Cloud 依赖链上的 moderate `uuid` 提示；
  `npm audit fix --force` 建议降级到不适合当前 Functions 版本的 `firebase-admin@10.3.0`，
  本次不做破坏性降级。

**下一步**
1. 前端新增调用 `createRoom` / `joinRoom` 的 API 包装。
2. 将 `roomStore` 从本地 mock 切到真实后端。

---

## 2026-06-03 — Phase 2 Task 1：Firebase Web SDK 初始化 ✅

**做了什么**
- 给 `apps/web` workspace 安装 Firebase Web SDK。
- 新增 `apps/web/src/lib/firebase.ts`，集中初始化 Firebase App、Firestore、Realtime Database
  和 Functions。
- 在 `apps/web/src/lib/env.ts` 增加 `useFirebaseEmulators` typed env 开关。
- 在 `.env.example` 与 `apps/web/src/vite-env.d.ts` 增加 `VITE_USE_FIREBASE_EMULATORS`。
- emulator 端口对齐 `firebase/firebase.json`：
  - Firestore：`127.0.0.1:8080`
  - Realtime Database：`127.0.0.1:9000`
  - Functions：`127.0.0.1:5001`

**关键决策**
- `getFirebaseServices()` 懒初始化 Firebase，避免仅导入模块时因为环境缺失导致页面崩溃。
- 当前 Functions 不指定 region，先保持和现有 `health` 探针一致；后续实现 callable functions
  时再统一区域策略。

**验证**
- `npm run build` 通过。
- `npm audit --omit=dev`：生产依赖 0 个漏洞。

**下一步**
1. 实现 Cloud Functions `createRoom` / `joinRoom`。
2. 前端后续通过 `getFirebaseServices()` 获取 Firestore / RTDB / Functions 实例。

---

## 2026-06-03 — Phase 2 任务拆分 ✅

**目标**
把 Phase 2 拆成可连续交付的小任务，每个任务完成后单独 commit，避免把后端、定位、地图和规则硬化混在一起。

**任务顺序**
1. Firebase Web SDK 初始化
   - 安装 `firebase` 到 `apps/web` workspace。
   - 新增 `apps/web/src/lib/firebase.ts`。
   - 从 `env.ts` 初始化 Firebase App、Firestore、Realtime Database。
   - 支持本地 emulator 连接开关。
   - 验证：`npm run build`。
2. Cloud Functions 基础接口
   - 实现 `createRoom` / `joinRoom` callable functions。
   - 写入 Firestore `rooms/{roomId}`、`members/{deviceId}`、`deviceSessions/{deviceId}`。
   - 不引入账号体系，只使用 `roomId + deviceId + deviceSecret`。
   - 验证：functions typecheck/build。
3. 前端房间流程接后端
   - 将 `roomStore.createRoom` / `joinRoom` 从本地 mock 替换为后端调用。
   - 保持现有 onboarding → room → map UI 流程不变。
   - 处理房间不存在、过期、容量满、网络错误。
   - 验证：`npm run build` + 手动创建/加入。
4. 位置状态与上传
   - 新增 `locationStore`。
   - 请求 Geolocation 权限，获取系统融合定位结果。
   - 仅在共享开启时写入 RTDB `liveLocations/{roomId}/{deviceId}`。
   - 停止共享后停止上传。
   - 验证：本地或真实项目查看 RTDB 更新。
5. 成员监听与状态
   - 新增 `membersStore`。
   - 监听 Firestore 成员列表和 RTDB 实时位置。
   - 显示在线、离线、位置过期、未共享位置状态。
   - 验证：双浏览器窗口加入同一房间。
6. 地图接入
   - 用 Google Maps JavaScript API 替换当前占位地图。
   - 显示自己和其他成员图钉。
   - 成员条显示真实距离和最后更新时间。
   - 验证：`npm run build` + 浏览器手动检查。
7. 安全规则收紧
   - 更新 `firestore.rules` 与 `database.rules.json`。
   - 尽量限制写入自己的成员、位置和轨迹。
   - 记录 v0 仍无法仅靠规则证明 `deviceSecret` 的限制。
   - 验证：Firebase emulator rules 测试或手动规则验证。

**当前执行**
- 先推进任务 1：Firebase Web SDK 初始化。

---

## 2026-06-03 — Phase 2 RTDB 创建完成 ✅

**做了什么**
- 用户已将 Firebase 项目升级到 Blaze 后，用 Firebase Realtime Database Management API
  创建 RTDB 实例：`zhinzen-live`。
- 实例区域：`asia-southeast1`。
- 实例状态：`ACTIVE`。
- 已把实例 URL 写入本地 `.env.local` 的 `VITE_FIREBASE_DATABASE_URL`（该文件被忽略，不提交）。

**当前环境状态**
- `.env.local` 中 8 个 `VITE_*` 配置均已设置：
  - `VITE_MAPS_API_KEY`
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_FIREBASE_DATABASE_URL`

**下一步**
1. 安装 Firebase Web SDK，新增 `apps/web/src/lib/firebase.ts`。
2. 实现 Cloud Functions `createRoom` / `joinRoom`。
3. 将 `roomStore` 从本地 mock 切到真实后端。
4. 接入 Geolocation 上传到 RTDB `liveLocations/{roomId}/{deviceId}`。

---

## 2026-06-03 — Phase 2 环境接手 / Firebase CLI 配置 ✅

**做了什么**
- 用 Firebase CLI / gcloud 接手 `zhinzen` 项目配置，确认项目可访问。
- 创建 Firebase Web App：`zhinzen-web`。
- 启用 Firebase / Firestore / Realtime Database 相关 API。
- 创建 Cloud Firestore 默认数据库：`(default)`，区域 `asia-northeast1`，Native mode。
- 新增 `.firebaserc`，默认项目指向 `zhinzen`。
- 用 CLI 拉取 Web SDK config 并写入本地 `.env.local`（该文件被 `.gitignore` 忽略，不提交）。
- 将 gcloud 默认项目与 ADC quota project 切到 `zhinzen`，便于后续 CLI / SDK 操作。

**当前环境状态**
- `.env.local` 中已设置：
  - `VITE_MAPS_API_KEY`
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_DATABASE_URL` 仍为空。

**阻塞 / 注意**
- Realtime Database 尚未创建。`firebase database:instances:create` 要求先有默认实例；
  使用官方 REST 管理 API 创建 `zhinzen-default-rtdb` 时返回：
  `Blaze plan required for multiple database instances`。
- 目前需要用户在 Firebase Console 的 Realtime Database 页面创建默认实例，或把项目升级到
  Blaze 后再用管理 API 创建实例。建议位置选亚洲可用区域（如 `asia-southeast1`）。
- Maps JS API key 仍需在 GCP Console 限制 HTTP referrer 与 API 范围；此前未确认限制状态。

**下一步**
1. 创建 Realtime Database 默认实例，并把 URL 填入 `.env.local` 的
   `VITE_FIREBASE_DATABASE_URL`。
2. 安装 Firebase Web SDK，新增 `apps/web/src/lib/firebase.ts`。
3. 先用 Firestore + emulator/真实项目实现 Cloud Functions `createRoom` / `joinRoom`。
4. RTDB 就绪后再接 `liveLocations/{roomId}/{deviceId}` 上传和监听。

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
