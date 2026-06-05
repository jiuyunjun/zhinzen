# 工作日志 / Worklog

> 面向多 agent 协作的交接记录。每完成一项工作，在最上方追加一条带日期的条目，
> 说明：做了什么、关键决策、改动的文件、还剩什么 / 下一步。最新在最上面。

---

## 2026-06-05 — 网页能力标签 + 安卓 BLE 近距离测距（web 已部署 / android 已编译）✅

**1) 网页不显示 UWB/蓝牙能力 → 修了**
- 之前重写网页 `MemberDetailPanel` 时丢了能力标签。重新加上 `CapabilityChips`：成员
  `capabilities.uwb` → 「UWB 可用」、否则 `ble` → 「蓝牙」、`!compass` → 「无方向传感器」。
  网页成员本身 uwb/ble=false（浏览器限制,符合设计）,仅 App 成员会显示。新增 i18n
  `uwbReady/bleRange/compassOff`。**已部署**。

**2) 安卓 BLE 近距离测距（design §5.8）**
- 新增 `nearby/BleRangingController`：广播 manufacturer data(company 0xFFFF + deviceId 的
  SHA-256 前 4 字节 token)+ 扫描同类广播,RSSI → 粗略距离桶（很近/较近/较远/信号弱,
  **不报精确米数**）。token 让扫描方把广播匹配到房间成员 deviceId。
- 权限：manifest 加 `BLUETOOTH_SCAN/ADVERTISE/CONNECT`(31+) + 旧版 `BLUETOOTH(_ADMIN)`(≤30);
  地图权限请求里一并申请(31+)。
- VM：选中他人时 `startNearby()`(BLE 支持且授权才启),扫描回调把 token→deviceId 映射、
  更新 `nearbyRssi`;取消选择/离开 `stopNearby()`。成员详情显示「蓝牙距离：很近」等。
- UWB 精准测距仍**未实现**(androidx.core.uwb alpha + 仅少数机型 + 需 OOB 协商),
  能力检测已做;计划见 `design.md §8.4`。

**验证**：android `assembleDebug` ✅;web `build` ✅ 并**已部署**。
⚠️ BLE 测距需**两台真机**验证(广播/扫描/RSSI 因机型差异大,桶阈值可能要调)。

---

## 2026-06-05 — 修复：在线状态用 RTDB onDisconnect + 通知图标（web 已部署）✅

**问题**
1. 杀掉 App / 关掉网页后,对方仍显示「在线」(最多约 60s 后才因位置过期变灰)。根因:没有
   断连检测,成员 `online`(Firestore)创建后从不复位,且 60s 内实时位置看起来仍新鲜。
2. 安卓前台服务**没有常驻通知**:小图标用了多色 launcher 矢量(不是合法通知小图标),
   且通知权限可能未授予。

**修复**
- **RTDB 在线状态(presence / onDisconnect)**:连接断开(杀进程/断网/关标签页)时,服务端
  自动把 `liveLocations/{roomId}/{deviceId}.sharingLocation` 置 false → 对方立刻看到「未共享」
  而非在线。监听 `.info/connected`,每次(重)连都重新 arm onDisconnect。
  - web:`locationApi.setupPresence()`,在 `locationStore` 开始共享时 arm、停止时 cancel。
  - android:`LocationSharingService.setupPresence()`,onStartCommand 里 arm。
- **通知图标**:新增白色单色 `ic_notification.xml`(地图针轮廓),服务改用它;地图权限请求
  已含 `POST_NOTIFICATIONS`(API33+),需用户允许通知才能看到常驻通知。

**说明 / 后续**
- Firestore 的 `member.online` 仍不会自动复位,但状态现在以实时位置的 `sharingLocation`
  为准(onDisconnect → false → 未共享),不会再误显示在线。更彻底的做法:用 Cloud Function
  监听 RTDB onDisconnect 同步 Firestore online=false(留待后续)。

**验证**:android `assembleDebug` ✅;web `build` ✅,**已 `firebase deploy --only hosting`**。
真机/多端验证:杀 App 后对方应在 1–2s 内变灰。

---

## 2026-06-05 — Android：后台持续定位（前台服务）+ UWB/BLE 能力检测 ✅（已编译）

**1) 后台持续共享位置（前台服务）**
- 新增 `service/LocationSharingService`（`foregroundServiceType=location`）：独立持有 Fused
  定位采集 + 实时位置(RTDB)/自适应轨迹(Functions)上传 + 常驻通知「正在共享你的位置」。
- 重构：`AppViewModel` 不再自行采集定位,改为 `startLocation()`/`stopLocation()` 启停服务;
  `ownLocation` 由成员实时回显推导(`rebuildMembers` 里取 self 的 location)。共享开关/进房/
  离开都对应启停服务。
- 权限：manifest 增 `ACCESS_BACKGROUND_LOCATION`、`FOREGROUND_SERVICE`、
  `FOREGROUND_SERVICE_LOCATION`、`POST_NOTIFICATIONS`;地图权限请求里加通知权限(API33+)。
- 机制：在前台启动服务 → 适用前台服务定位豁免;「始终允许」后台定位可长时间后台跑。
  从地图按返回(销毁)会停服务;按 Home 退后台 ViewModel 存活 → 服务继续。

**2) UWB/BLE 能力检测**
- 新增 `util/DeviceCapabilities.detect()`:UWB(`android.hardware.uwb` + Android 12+)、
  BLE(`FEATURE_BLUETOOTH_LE`) 真实检测,写入成员 `capabilities`(之前安卓硬编码 false)。
  `Backend.createRoom/joinRoom` 改为接收 capabilities;网页的 UWB/蓝牙能力标签据此显示。

**近距离 UWB/蓝牙测距：尚未实现**(大子系统、需双机真机)。方案已写入 `design.md §8.4`:
OOB 信令(RTDB)交换 UWB 地址/BLE 标识 → UWB `androidx.core.uwb` ranging / BLE RSSI 粗距桶。

**验证**：`./gradlew assembleDebug` BUILD SUCCESSFUL。⚠️ 后台/通知/能力均需**真机**验证。
文档已同步:`design.md §8.4`、`README` 阶段表。

---

## 2026-06-05 — 安卓返回手势回房间页 + 自适应轨迹采样（web + android）✅

**1) 安卓地图页返回手势**
- `ZhinzenApp` 加 `BackHandler(enabled = phase==Map)`：先关闭打开的成员详情,否则
  `leaveRoom()` 回到房间页,不再直接退出 App。

**2) 自适应轨迹采样（修高速时轨迹偏离实际路线）**
- 原来固定每 12s 采一个轨迹点 → 高速时点间隔太大,折线切角偏离真实路线。
- 改为**按距离 + 时间**采样:移动 ≥12m 即采点(速度越快越密),静止时每 20s 心跳一次,
  最短间隔 2.5s 防刷。两端一致:
  - android `AppViewModel`：用 `Geo.distanceMeters` 判断;常量 TRACK_MIN_INTERVAL=2.5s /
    MAX=20s / MIN_DISTANCE=12m。
  - web `locationStore`：用 `calculateDistance`;同样阈值。
- 注:轨迹密度也受定位更新频率限制(android fused 3s/1s;web watchPosition)。

**验证**：android `assembleDebug` ✅；web `npm run build` ✅。**web 未重新部署**。

---

## 2026-06-05 — 震动反馈 + heading-up 平滑 + 轨迹配色阈值（web + android）✅

**1) heading-up 卡顿**
- 原因主要是罗盘采样过密 → Compose 重组风暴 + 相机直接 set 造成跳变。
- `CompassController`：采样率 `SENSOR_DELAY_GAME`，并加节流（变化 ≥0.8° 且间隔 ≥40ms 才 emit），
  大幅减少重组。
- `MapScreen` heading-up 跟随改用 `cameraPositionState.animate(..., durationMs=220)` 做**补间**，
  样本之间平滑过渡，不再一卡一卡。

**2) 震动反馈（web + app）**
- web `lib/haptics.ts`（Vibration API）：`tap/light/success/error`。接入 `PrimaryButton`(tap)、
  地图 FAB(tap)、复制邀请(success)、选中成员(light)、`roomStore` 创建/加入成功(success)/失败(error)。
  注：iOS Safari 不支持 Vibration，自动 no-op。
- android `util/Haptics.kt`（Vibrator + VibrationEffect，加了 `VIBRATE` 权限）：同样 tap/light/
  success/error。接入 ViewModel 的创建/加入(tap+success/error)、共享开关/指南针/改名/离开(tap)、
  选中成员(light)，以及地图「查看所有人」/导航按钮(Compose `LocalHapticFeedback`)。

**3) 轨迹配色阈值改为 km/h + 渐变**
- 之前用 m/s 阈值，城市速度容易一直偏红。改为按 **km/h**：0–15 红、~28 黄、40+ 绿，
  区间平滑渐变。web(`GoogleMapView.colorForTrackSpeed`) 与 android(`MapScreen.colorForSpeed`)
  都把输入 m/s ×3.6 转 km/h 后按新 stops 插值。

**验证**：android `./gradlew assembleDebug` ✅；web `npm run build` ✅。**web 未重新部署**。

---

## 2026-06-05 — Android：地图旋转 + 指南针/heading-up ✅（已编译）

**做了什么**
- 开启地图旋转/倾斜手势（`MapUiSettings(rotationGesturesEnabled=true, tiltGesturesEnabled=true)`），
  关掉内置指南针（用自绘 FAB 代替）。
- 右侧新增**指南针 FAB**（自绘北向指针，旋转 `-相机bearing` 始终指北）：
  - `AppViewModel.headingUp` + `toggleHeadingUp`；点开 → 罗盘运行、地图 bearing 跟随设备朝向
    (`LaunchedEffect(headingUp, deviceHeading)` 设相机 bearing)；关闭 → 动画回正北。
  - 罗盘运行条件统一为 `updateCompass()`：heading-up 开 或 选中他人 时运行。
- 安卓 Maps SDK 原生支持旋转（不像 Web JS 需要 vector Map ID），所以这块不依赖额外配置。

**验证**：`./gradlew assembleDebug` BUILD SUCCESSFUL。仅编译验证；旋转/罗盘需真机。

**Android 现状**：已基本覆盖 web Phase 2–4 全部功能。剩余多为真机调优
（罗盘抖动、轨迹抽稀、heading-up 跟随平滑度）。

---

## 2026-06-05 — Android：进房 loading + 轨迹上传/显示 ✅（已编译）

**进房间慢 → loading + 预热**
- RoomChoice 创建/加入时显示全屏半透明遮罩 + `CircularProgressIndicator`。
- `MainActivity` 启动时 `Backend.warmUp()` 预初始化 Firestore/RTDB/Functions 客户端，
  首次 create/join 不再付 SDK 初始化时间。
- 根因是 gen2 函数**冷启动**（闲置后首调拉容器）。彻底消除需给 createRoom/joinRoom 设
  `minInstances=1`（常驻热实例，约几美元/月）—— 未做，等用户确认是否愿意付费。

**轨迹上传 + 显示（对齐 web Phase 3）**
- `data/Models` 加 `TrackPoint`；`Backend.appendTrackPoint`(callable) + `fetchTrack`
  (Firestore 查询 createdAt>since)。
- `AppViewModel`：定位采集里每 ~12s 调一次 `appendTrackPoint`；选中他人时拉取其最近 24h
  轨迹到 `trackPoints`，取消选择/离开清空。
- `MapScreen`：选中成员的轨迹用 `Polyline`(紫色) 画在地图上。

**验证**：`./gradlew assembleDebug` BUILD SUCCESSFUL。仅编译验证。

**未做**：地图旋转/指南针按钮、过期可导航提示、轨迹按速度分段着色（web 有）、
createRoom/joinRoom 的 minInstances（待用户定）。

---

## 2026-06-05 — Android：共享开关 + 查看所有人 + track 取景 ✅（已编译）

**做了什么**
- **共享开关**：右侧悬浮按钮 ⏸/▶。`AppViewModel.updateSharing(on)` 暂停时停止定位采集并把
  RTDB 实时位置写成 `sharingLocation=false`（别人看到「未共享」），恢复时重新开始上传。
- **查看所有人**：⤢ 悬浮按钮 → `fitBounds` 把所有有位置的成员框进视野。
- **track 取景**：选中他人时 `LaunchedEffect(selectedDeviceId)` 自动把相机取景到「我 + 目标」。
- 头像右下角小圆点 = 成员状态（在线/过期/离线·未共享），与底部成员条/网页一致（保留）。

**验证**：`./gradlew assembleDebug` BUILD SUCCESSFUL（修了一个 `setSharing` 与 `var sharing`
生成 setter 的命名冲突 → 改 `updateSharing`）。仅编译验证。

**未做**：地图旋转/指南针按钮、轨迹上传/显示、过期可导航的「对方可能已移动」提示、
FAB 图标目前用 unicode 字形（⏸/▶/⤢），后续可换矢量图标。

---

## 2026-06-05 — Android：头像图钉 + 罗盘方向指针 ✅（已编译）

**做了什么**
- **地图用头像图钉**：把默认的 Google 水滴 marker 换成自绘头像 —— 用 maps-compose 的
  `MarkerComposable`(实验 API) 渲染 `AvatarMarker`（白底圆 + 强调色圆 + 首字母 + 状态色点）。
  自己=蓝、他人=紫。
- **罗盘方向指针**：`sensor/CompassController`(TYPE_ROTATION_VECTOR → azimuth，EMA 平滑)。
  `AppViewModel` 在选中**他人**时启动罗盘、清除/离开时停止，暴露 `deviceHeading`。
  成员详情（他人）新增方向箭头：`相对方位 = bearing(自己→目标) - 设备朝向`，用连续角
  (continuous-angle) + `animateFloatAsState` 避免过 0°/360° 时绕圈（镜像 web 的修法）。
  无罗盘/无定位时显示「—」。

**验证**：`./gradlew assembleDebug` BUILD SUCCESSFUL。仅编译验证。

**未做（后续 Android 增量）**：共享开关、track 模式取景、地图旋转/指南针按钮、轨迹上传/显示、
过期可导航的「对方可能已移动」提示。

---

## 2026-06-05 — Android：成员列表/详情 + 改名 + 历史房间 + edge-to-edge ✅（已编译）

**做了什么**
- **edge-to-edge 做好**：`MainActivity.enableEdgeToEdge()` 已开；这次把 Compose 侧 insets
  处理对：`GoogleMap(contentPadding = WindowInsets.systemBars)`（Google logo/控件不被系统栏
  遮挡，符合 Maps 条款）、顶部房间码用 `statusBarsPadding()`、底部 sheet 用 `navigationBarsPadding()`。
- **底部成员条**：横滑成员头像（首字母 + 状态色点），点击选中。
- **成员详情**（选中替换成员条）：他人 → 距离(Geo haversine) + 最后更新 + Google 地图导航
  (Intent ACTION_VIEW)；自己 → 改名输入 + 保存 + 离开房间。
- **改名传播**：`renameInRoom` 改本地 + 立即更新 ownLocation.displayName + best-effort 重新
  `joinRoom` 刷新成员文档（下次位置上传也带新名字）。
- **历史房间**：`data/RoomHistory`(SharedPreferences，≤10) + RoomChoice 底部「最近加入」列表，
  点条目重新加入、✕ 移除；进房间时记录。
- `data/Geo.kt`：haversine 距离 + 方位角 + 距离格式化（镜像 geo-utils）。
- 新增 zh/en 文案（recent_rooms / distance / last_updated / navigate / status_*）。

**验证**：`./gradlew assembleDebug` BUILD SUCCESSFUL。仅编译验证，未真机跑。

**未做（下一个 Android 增量）**：罗盘方向指针(SensorManager)、track 模式取景、地图旋转/指南针、
共享开关 + 轨迹上传/显示、过期导航提示文案对齐 web。

---

## 2026-06-04 — Phase 5 增量：Android 接 Firebase + 地图 + 实时定位 ✅（已编译）

**做了什么**
把安卓骨架接上真实后端，复用 web 同一套 Cloud Functions / Firestore / RTDB，做到
**两端能加入同一个房间、互相看到实时位置**（相当于 web 的 Phase 2）。

**Gradle / 配置**
- `google-services` 插件 + Firebase BoM 33.7.0（firestore/database/functions）、
  `maps-compose` 6.2.1、`play-services-location`、`kotlinx-coroutines-play-services`、
  `accompanist-permissions`。
- Android Maps key 从 `local.properties` 的 `MAPS_API_KEY` 注入 manifest 占位符
  `${MAPS_API_KEY}`（meta-data `com.google.android.geo.API_KEY`）。
- `google-services.json` 放 `apps/android/app/`（已 gitignore；包名 `com.lazydoglab.zhinzen`）。

**代码（com.lazydoglab.zhinzen）**
- `data/Models.kt`：RoomMember / LiveLocation / DeviceCapabilities / MemberView +
  `deriveStatus`（全部带默认值，便于 Firestore/RTDB 反序列化）。
- `data/Backend.kt`：Firestore / RTDB(命名实例 zhinzen-live) / Functions(asia-northeast1)，
  `createRoom`/`joinRoom` 调用现有 callable（coroutines `.await()`）。
- `location/LocationController.kt`：Fused Location → `Flow<Location>`（callbackFlow）。
- `AppViewModel`：create/join 改异步（busy/error），进房间后监听 Firestore 成员 + RTDB
  实时位置并合并成 `members`，定位权限授予后采集位置、3s 节流上传 RTDB。
- `ui/screens/MapScreen.kt`：真实 **GoogleMap**(maps-compose) + accompanist 运行时权限
  + 成员图钉(按状态着色) + 首次定位居中 + 房间码/人数 + 离开房间。
- RoomChoice 接异步 busy/error；新增定位权限文案(zh/en)。

**验证**
- `./gradlew clean assembleDebug` **BUILD SUCCESSFUL**，产出 APK。
  （修了两个：`setDisplayName` 改名；maps-compose 6.2.1 没有 `rememberUpdatedMarkerState`，
  改用 `rememberMarkerState` + `LaunchedEffect` 更新位置。还遇到一次 R.jar 构建缓存文件锁，
  `clean --no-build-cache` 后通过。）
- ⚠️ 仅编译验证，**未真机/模拟器运行**；地图要显示需在 `local.properties` 填 `MAPS_API_KEY`。

**未做（下一个 Android 增量）**
- 罗盘方向指针(SensorManager)、成员详情/距离面板、改名、历史房间、track 模式、地图旋转/指南针。
- 轨迹上传(appendTrackPoint) 与显示。
- `google-services.json` 当前 gitignore；CI/他人需各自放置。Maps key 目前未绑定应用限制
  （用户暂未限制），上线前应在 GCP 给安卓 key 加 包名+SHA-1 限制。

---

## 2026-06-04 — Phase 5 起步：Android UI 骨架 ✅（可编译运行，无后端）

**做了什么**
新建 `apps/android/`：Kotlin + Jetpack Compose 的可编译 App 骨架，跑通
onboarding → room → map 占位流程，复用设计 token。**暂不接后端**（创建/加入只改本地
状态），和 web 的 Phase 1 节奏一致。Firebase/Maps/定位放下一增量。

**结构**
- Gradle：`settings.gradle.kts` / `build.gradle.kts` / `gradle.properties` /
  版本目录 `gradle/libs.versions.toml`（AGP 8.7.3、Kotlin 2.0.21、Compose BOM
  2024.12.01）。`app/build.gradle.kts`：namespace/appId `com.zhinzen.app`，
  minSdk 26 / target 35 / compile 35，`buildToolsVersion = "34.0.0"`（本机没装
  35.0.0，34 是 AGP 8.7 的下限）。
- 代码（`app/src/main/kotlin/com/zhinzen/app/`）：`MainActivity`、`ZhinzenApp`
  (phase 路由)、`AppViewModel`(AndroidViewModel，phase/name/roomId)、
  `device/DeviceIdentity`(SharedPreferences 存 deviceId/secret/name，对应 §2.2)、
  `data/RoomCode`(Crockford base32，对应 web roomCode)、`ui/theme/*`(token 颜色，
  sRGB 近似 web oklch)、`ui/screens/*`(Onboarding/RoomChoice/Map 占位/Components)。
- 资源：`values/`(中文，zh-first) + `values-en/`(英文)、`themes.xml`(NoActionBar，
  无需 Material Components 依赖)、`drawable/ic_launcher.xml`(矢量图标)、`colors.xml`。

**关键决策**
- 包管理：apps/android 不纳入根 npm workspaces（Gradle 独立）。
- 颜色 token 在 Kotlin 里重新定义为 sRGB 近似值（Compose 不支持 oklch），需与
  `packages/shared-ui` 大致同步。
- 数据模型（RoomCode、DeviceIdentity）在 Kotlin 里**镜像** web/shared-types 的逻辑
  （TS 无法直接复用），保持行为一致（房间码字母表/长度一致，跨端可互相加入）。
- 避免了实验性 API（不用 `Card(onClick)`，改 `Modifier.clickable`）。

**验证（实测 CLI 构建）**
- 本机已装 Android SDK（platforms 34/35/36，build-tools 34/36）+ Android Studio + JDK 21。
- 用 Gradle 8.11.1 生成 wrapper（已提交 `gradlew`/`gradle-wrapper.jar`）。
- `./gradlew assembleDebug` **BUILD SUCCESSFUL**，产出 `app-debug.apk`（~9.5MB）。
  （修了一个编译错误：`fun setDisplayName` 与 `var displayName` 的生成 setter 冲突 →
  改名 `updateDisplayName`。）
- `local.properties`(sdk.dir) 与 `**/build/` 已 gitignore，未提交。

**下一步（Android 增量）**
1. 接 Firebase：在 Firebase 控制台**注册 Android 应用**(包名 `com.zhinzen.app`) 拿
   `google-services.json` 放 `apps/android/app/`，加 google-services 插件 + BoM；
   复用现有 `createRoom/joinRoom/appendTrackPoint`(asia-northeast1) callable。
2. Maps：申请**带签名 SHA-1 的 Android Maps key**(Maps SDK for Android)，接 Maps Compose。
3. 定位：Fused Location Provider + 运行时权限，上传 RTDB `liveLocations`。
4. 方向指针：SensorManager(罗盘) + geo 计算（镜像 web）。
5. 历史房间、改名、track 模式等对齐 web。

---

## 2026-06-03 — 地图旋转/指南针、查看所有人、历史房间 ✅

**1) 地图旋转 + 指南针按钮（heading-up）**
- 新增 env `VITE_MAPS_MAP_ID`（`env.ts` 的 `mapsMapId` / `isMapRotatable()`，
  `vite-env.d.ts` + `.env.example` + `.env.local` 占位）。**矢量 Map ID 才能让地图旋转**
  （Google Maps JS API：栅格底图不支持旋转/heading）。需在 Google Cloud → Maps → Map
  Management 创建一个 JS 矢量 Map ID 填进 `.env.local`。
- `GoogleMapView`：有 mapId 时用矢量底图 + `rotateControl` + `headingInteractionEnabled`
  （此时不传 `styles`，矢量样式在云端配）；监听 `heading_changed` 回传地图朝向。新增
  `headingUp` 模式：开 → `map.setHeading(deviceHeading)`（用 sensorStore 罗盘，随手机转）；
  关 → `setHeading(0)`（正北朝上）。
- `MapScreen`：右侧新增**指南针 FAB**（针随地图朝向反向旋转指北；点按切换 heading-up，
  高亮表示开启；无 Map ID 时提示 `rotateNeedsMapId`，不旋转）。Google Maps JS API 没有
  内置“跟随设备罗盘自动旋转”，所以是用我们的 sensor heading 自己实现的。

**2) 查看所有人按钮（fit bounds）**
- `MapScreen` 新增 **fit-all FAB**：`fitAllSignal++` → `GoogleMapView` `fitBounds` framing
  所有可见图钉，底部留 320px 给 sheet；同时把 `followMode` 切 `free`。

**3) 创建房间页历史加入房间（本地，≤10）**
- 新增 `lib/roomHistory.ts`：localStorage（`zhinzen.roomHistory.v1`），newest-first、去重、
  上限 10。`getRoomHistory` / `addRoomToHistory` / `removeRoomFromHistory`。
- `roomStore`：创建/加入成功后 `addRoomToHistory(roomId)`。
- `RoomChoice`：底部「最近加入」列表，点条目直接重新加入（走 `joinRoom`），右侧垃圾桶移除。
  时间显示 just now / Xm / Xh / Xd。

**新增图标**：`compass` / `fitAll` / `trash`（`Icon.tsx`）。

**验证**
- `npm run build` 通过（主 bundle ~713KB，老 TODO：Firebase 代码拆分）。
- **未重新部署**。注意：线上要让旋转生效，需先建 Map ID 填 `.env.local` 再 build + deploy。

---

## 2026-06-03 — 首次部署到 Firebase（zhinzen）✅

**已上线**
- **Hosting**：https://zhinzen.web.app （HTTP 200，标题正确）。
- **Firestore 规则**：部署成功（默认 (default) 库存在）。
- **Functions**：`createRoom / joinRoom / appendTrackPoint` 此前已在线（本次 No changes），
  `health` 更新成功（https://health-g5fakuj3oa-uc.a.run.app 返回 ok）。项目已是 Blaze。
- **RTDB 规则**：见下方 workaround，已发布成功（status: ok）。

**部署步骤（复现用）**
1. `npm run build --workspace @zhinzen/web`（env 从根 `.env.local` 注入到打包产物）。
2. `cd firebase/functions && npm install && npm run build`（根 firebase.json 的 functions 没有
   predeploy hook，需手动 build 出 `lib/`）。
3. `firebase deploy --only "hosting,firestore" --project zhinzen`（PowerShell 下 `--only` 列表
   必须加引号）。
4. `firebase deploy --only functions --project zhinzen`。

**⚠️ RTDB 规则部署的坑（重要，handoff 必读）**
- RTDB 实例是命名实例 `zhinzen-live`（asia-southeast1），项目**没有默认实例**
  （`<project>-default-rtdb`）。firebase-tools 15.x 的已知 bug：即便用
  `database.instance` 或 `target`，`firebase deploy --only database` 仍报
  “haven't created a default Realtime Database instance”。`firebase target:apply database
  live zhinzen-live` + firebase.json 用 `"target": "live"` 也没绕过。
- **可行 workaround（本次采用）**：用 gcloud 取 token 后 REST PUT 规则：
  ```
  $token = gcloud auth print-access-token
  Invoke-RestMethod -Method Put `
    -Uri "https://zhinzen-live.asia-southeast1.firebasedatabase.app/.settings/rules.json" `
    -Headers @{ Authorization = "Bearer $token" } `
    -Body (Get-Content -Raw firebase/database.rules.json) -ContentType "application/json"
  ```
  （需要本机 gcloud 已登录有 cloud-platform scope 的账号。）
- 以后改 RTDB 规则：要么用上面的 REST PUT，要么在控制台 Realtime Database → 规则 粘贴
  `firebase/database.rules.json` 内容发布。`firebase.json` 现用 `database.target = "live"`
  （target 已 apply 到 `.firebaserc`）。

**下一步**
1. 真机打开 https://zhinzen.web.app 验证：定位权限、创建/加入房间、成员实时位置、改名、
   方向指针、track 取景。
2. **Maps key 限制**（仍未确认）：GCP 控制台给 key 加 HTTP 引荐来源（`zhinzen.web.app/*`、
   `localhost:5173/*`）+ 限制为 Maps JavaScript API。否则线上域名可能因未授权无法加载地图。
3. 主 bundle ~712KB：做 Firebase 代码拆分（manualChunks / 动态 import）。

---

## 2026-06-03 — Phase 4 收尾 + 地图/改名体验改进 ✅

**Phase 4 收尾（方向指针平滑）**
- `sensorStore`：对罗盘朝向做圆周指数平滑（EMA，alpha 0.18）+ 阈值节流（变化 ≥0.6° 才
  emit），消除箭头抖动。`stopCompass` 重置平滑状态。

**改名（需求 1）**
- `RoomChoice`：问候语旁加「改名字」按钮，点开内联输入 + 保存（仅本地 `setDisplayName`，
  此时还没进房间）。
- 地图自己详情面板（点底部「你」或地图蓝点）：内联名字输入 + 保存。保存时三处同步：
  `deviceStore.setDisplayName`（本地+持久化）、`locationStore.updateDisplayName`（更新
  activeInput + 立即补写一次 RTDB 实时位置）、`roomStore.syncMembership`（best-effort 重新
  upsert Firestore 成员文档，让别人看到新名字）。
- 为避免改名触发整段定位 effect 重启 GPS watch，已把 `displayName` 移出该 effect 依赖
  （改名走上面三处同步）。

**地图居中模式（需求 2/3/4）**
- 新增 `followMode: 'self' | 'free' | 'track'`（默认 `self`）。
- `self`：相机跟随自己位置（位置更新即 `panTo`）。
- 用户拖动地图 → `GoogleMapView` 监听 `dragstart`（仅用户手势触发，程序化 panTo/fitBounds
  不触发）→ 回调把 `followMode` 切为 `free`。
- 点「回到我的位置」FAB → `followMode='self'` + `recenterSignal++` 强制回中。

**追踪其他成员（需求 6）**
- 点其他成员 → `followMode='track'`，`fitBounds(自己 + 目标)`，并给底部留 320px padding，
  保证两个点都在 sheet 上方可见。仅在选择变化/点 recenter 时 fit 一次（不随目标移动重复
  fit，避免抖动）。点自己 → 进自己详情且保持 `self` 跟随。关闭详情 → 回 `self`。

**详情面板太高（需求 5）**
- 选中成员时，底部 sheet 用详情面板**替换**成员横条（不再堆叠），并给 sheet 加
  `maxHeight: min(46vh, 460px)` + `overflowY: auto`，地图信息不再被挡。
- `MemberDetailPanel` 拆成自己面板（名字编辑 + 离开房间）与他人面板（距离 + 方向指针 +
  Google 导航），去掉了原先堆叠用的上边框/外边距。

**验证**
- `npm run build` 通过。主 bundle 仍 ~708KB（既有 TODO：Firebase 代码拆分）。
- 真机仍待验证：罗盘平滑效果、track 模式取景、改名跨端可见。

---

## 2026-06-03 — Web 后台定位限制提示与前台刷新 ✅

**做了什么**
- `locationStore` 新增 `refreshNow()`。
- 页面回到前台时使用 `getCurrentPosition` 立即刷新并强制写一次 RTDB 实时位置。
- 如果满足轨迹间隔，回前台刷新也会补一次轨迹点。
- `MapScreen` 监听 `document.visibilitychange`：
  - 后台时提示“浏览器后台可能暂停位置更新”。
  - 回前台时提示“已回到前台，正在刷新位置”并触发 `refreshNow()`。
- `design.md` 补充 Web 后台定位限制：
  - Web 不能承诺浏览器后台持续获取位置。
  - 真正可靠的后台持续共享放到 Android App Foreground Service。
- i18n 增加后台限制和前台刷新文案。

**验证**
- `npm run build` 通过。
- Vite 仍提示主 bundle 超过 500KB，后续应单独做 Firebase 代码拆分。

**下一步**
1. 部署 Hosting，真机验证后台提示和回前台刷新。
2. Android 阶段实现 Foreground Service 后台持续共享。

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
