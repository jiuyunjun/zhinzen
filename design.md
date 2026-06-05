# design.md

## 1. 项目概述

本项目是一个位置共享 Web / App 产品。

目标是解决两人及以上场景下，互相知道对方当前位置、距离、方向和移动轨迹的需求。

典型使用场景：

1. 两个人在车站、商场、活动会场中互相寻找。
2. 多个人出行时确认彼此位置。
3. 骑行、步行、旅游时查看队友位置。
4. 通过方向指针快速找到对方。
5. App 端在足够近的距离下，通过 UWB 或蓝牙提高相对定位体验。

---

## 2. 核心原则

### 2.1 不使用账号体系

本项目不设计账号注册、登录、密码、邮箱、手机号验证。

用户只需要：

1. 打开 Web 或 App。
2. 输入自己的显示姓名。
3. 创建房间或加入房间。
4. 开始共享位置。

当前设备就是一个参与者。

系统不问用户“你是谁的账号”，只关心“这个设备现在叫什么名字、在哪个房间、位置在哪里”。

---

### 2.2 设备即用户

每个客户端第一次启动时，本地生成：

```text
deviceId
deviceSecret
```

说明：

```text
deviceId：设备参与者 ID，用来区分房间里的不同设备。
deviceSecret：设备本地密钥，用来降低别人伪造同一个 deviceId 的风险。
displayName：用户输入的显示姓名。
```

用户可见：

```text
displayName
```

用户不可见：

```text
deviceId
deviceSecret
```

业务概念上不使用账号。

技术概念上使用设备级凭证保护写入权限。

---

### 2.3 房间即共享空间

多个设备通过同一个房间共享位置。

加入方式：

1. 创建房间。
2. 系统生成邀请链接。
3. 其他人打开邀请链接。
4. 输入自己的显示姓名。
5. 加入房间。

邀请链接示例：

```text
https://example.com/r/{roomId}
```

房间特点：

1. `roomId` 必须随机且难猜。
2. 房间可以设置过期时间。
3. 房间内显示所有在线设备。
4. 房间内可以显示最近离线设备。
5. 房间内设备可以随时停止共享。
6. 房间内设备可以随时离开。
7. MVP 默认房间有效期为 24 小时。
8. RTDB 中该房间的实时位置数据从房间创建起最多保留 24 小时。
9. 房间过期后，后端清理 `liveLocations/{roomId}` 并停止接受新的实时位置写入。

---

## 3. 平台范围

### 3.1 Web

优先实现。

目标设备：

1. 手机浏览器。
2. Android Chrome。
3. iOS Safari。
4. 桌面浏览器只做兼容，不作为主体验。

Web 功能：

1. 输入显示姓名。
2. 创建设备身份。
3. 创建房间。
4. 加入房间。
5. 获取系统融合定位结果。
6. 获取 IMU / 罗盘数据。
7. 记录自己的行动轨迹。
8. 在 Google Map 上显示自己。
9. 在 Google Map 上显示其他在线用户。
10. 在地图之外显示其他人的图标或列表。
11. 点击其他人后显示对方移动轨迹。
12. 点击其他人后可跳转 Google Maps 导航。
13. 点击其他人后显示方向指针和距离。
14. 显示权限状态。
15. 显示网络状态。
16. 显示定位状态。
17. 显示对方在线 / 离线 / 位置过期状态。

Web 限制：

1. Web 端无法稳定使用 UWB。
2. Web 端蓝牙能力受浏览器限制。
3. Web 端后台定位能力有限。
4. Web 端 IMU / 罗盘权限受浏览器和系统限制。
5. 室内定位精度不稳定。
6. Web 端方向指针依赖 GPS、罗盘和 IMU，可能会抖动。
7. Web 端不能承诺浏览器后台持续获取位置；页面进入后台后，浏览器可能暂停
   `watchPosition` 和 JavaScript 执行。
8. Web 端回到前台时应立即刷新一次当前位置并恢复正常上传节奏。

---

### 3.2 Android App

第二阶段实现。

Android App 功能：

1. 与 Web 保持一致 UI 风格。
2. 使用原生定位能力。
3. 使用原生 IMU / 罗盘能力。
4. 使用 Google Maps SDK。
5. 支持后台持续共享位置。
6. 支持通知栏提示正在共享位置。
7. 支持 UWB 能力检测。
8. 支持 UWB 精准方向感知。
9. 不支持 UWB 时，使用蓝牙估算距离。
10. 支持比 Web 更稳定的近距离找人体验。

Android App 重点：

1. 用户明确同意后才持续共享位置。
2. 后台共享必须显示前台服务通知。
3. UWB 只在双方设备都支持时启用。
4. 蓝牙距离只作为粗略参考，不应宣传为精准定位。
5. App 与 Web 使用同一套后端数据结构。

---

### 3.3 iOS App

后期移植。

iOS App 功能目标：

1. 与 Web / Android 保持一致 UI 风格。
2. 使用 iOS 原生定位。
3. 使用 iOS 原生传感器。
4. 支持 Google Maps 或 Apple Maps 跳转。
5. 后期评估 UWB 能力。
6. 后期评估蓝牙距离能力。

iOS 注意事项：

1. iOS 权限限制更严格。
2. 后台定位需要清楚说明用途。
3. UWB API 使用限制较多。
4. 需要单独设计权限说明和审核文案。

---

## 4. 用户流程

### 4.1 首次打开

流程：

```text
打开页面
↓
检查本地是否已有 deviceId
↓
没有则生成 deviceId 和 deviceSecret
↓
检查是否已有 displayName
↓
没有则要求输入显示姓名
↓
进入创建房间 / 加入房间页面
```

页面要求：

1. 用户只看到“输入你的名字”。
2. 不出现“注册”。
3. 不出现“登录”。
4. 不出现“账号”。
5. 不出现“密码”。

---

### 4.2 创建房间

流程：

```text
用户点击创建房间
↓
客户端请求创建 roomId
↓
服务端创建房间记录
↓
当前设备加入房间
↓
生成邀请链接
↓
显示地图页面
```

创建房间后显示：

1. 邀请链接。
2. 复制按钮。
3. 分享按钮。
4. 当前自己的位置。
5. 当前在线成员列表。
6. 位置共享开关。

---

### 4.3 加入房间

流程：

```text
用户打开邀请链接
↓
客户端检查 deviceId
↓
客户端检查 displayName
↓
没有姓名则要求输入
↓
加入房间
↓
请求位置权限
↓
显示地图页面
```

异常情况：

1. 房间不存在。
2. 房间已过期。
3. 房间人数达到上限。
4. 网络错误。
5. 位置权限被拒绝。

---

### 4.4 位置共享

流程：

```text
用户允许位置权限
↓
客户端获取当前位置
↓
客户端定期上传当前位置
↓
客户端监听其他成员位置
↓
地图实时更新
```

位置上传策略：

1. 移动明显时上传。
2. 固定时间间隔上传。
3. 用户停止共享时停止上传。
4. 页面关闭或 App 退出时更新在线状态。
5. 位置过期后 UI 显示“位置已过期”。
6. Web 页面进入后台时提示用户“浏览器后台可能暂停位置更新”。
7. Web 页面回到前台时立即请求一次当前位置并上传。
8. 真正可靠的后台持续共享放在 Android App 的 Foreground Service 实现。

建议上传频率：

```text
前台移动中：1 秒到 3 秒一次
前台静止中：5 秒到 15 秒一次
后台共享中：根据平台限制降低频率
停止共享：不上传
```

---

## 5. 核心功能设计

### 5.1 地图显示

地图使用 Google Maps。

地图上显示：

1. 当前设备位置。
2. 其他在线设备位置。
3. 其他离线但位置未过期的设备位置。
4. 当前设备轨迹。
5. 选中对象的轨迹。
6. 方向辅助线。
7. 目标距离。

地图交互：

1. 点击自己图标：显示自己的状态。
2. 点击别人图标：打开对方详情面板。
3. 点击轨迹开关：显示 / 隐藏轨迹。
4. 点击定位按钮：回到自己的位置。
5. 点击目标按钮：聚焦目标用户。
6. 点击导航按钮：跳转 Google Maps。

---

### 5.2 地图外成员显示

地图之外必须有成员显示区域。

推荐形式：

1. 底部横向头像列表。
2. 底部抽屉式成员列表。
3. 小圆形头像图标。
4. 在线状态点。
5. 距离文本。
6. 方向小箭头。

成员卡片信息：

```text
显示姓名
在线状态
距离
最后更新时间
共享状态
设备能力
```

状态示例：

```text
在线
离线
位置过期
正在移动
定位中
未共享位置
UWB 可用
蓝牙距离可用
```

---

### 5.3 点击其他人后的功能

点击其他人的地图图标或成员卡片后，显示对方详情面板。

详情面板功能：

1. 显示对方当前位置。
2. 显示对方距离。
3. 显示对方方向。
4. 显示最后更新时间。
5. 显示对方移动轨迹。
6. 提供 Google Maps 导航按钮。
7. 提供方向指针模式。
8. App 端显示 UWB / 蓝牙状态。

---

### 5.4 对方移动轨迹

轨迹来源：

1. 对方客户端上传的位置点。
2. 后端保存最近一段时间的轨迹。
3. 前端监听或查询轨迹点。

轨迹显示：

1. 默认显示自己的轨迹。
2. 点击对方后可显示对方轨迹。
3. 同一时间只重点显示一个目标轨迹。
4. 轨迹点过多时需要抽稀。
5. 轨迹需要有保存期限。
6. 轨迹线需要表达速度变化。
7. 停留或极慢移动的线段使用红色系。
8. 快速移动的线段使用绿色系。
9. 中间速度使用线性颜色渐变，避免只用离散颜色。

轨迹保存策略：

```text
MVP：保存最近 24 小时
后续：允许房主选择保存时间
默认：房间过期后删除轨迹
```

轨迹线颜色规则：

```text
停留 / 极慢：红色
慢速移动：橙色
正常移动：黄色到浅绿
快速移动：绿色
```

颜色计算以相邻轨迹点的速度或位移 / 时间差为基础。Web 端应优先使用上报的 `speed`，
如果 `speed` 不可用或不可信，再用相邻点距离和时间差估算速度。轨迹线段颜色按速度做线性插值。

---

### 5.5 Google Maps 导航

点击“导航到对方位置”后：

1. 获取对方最新经纬度。
2. 生成 Google Maps 导航链接。
3. 打开 Google Maps。
4. 目的地为对方当前位置。

注意：

1. 对方位置过期时仍可导航到“最后已知位置”，但 UI 必须提示位置可能已过期 / 对方可能已移动。
2. 对方未共享位置（没有任何已知坐标）时不能导航。
3. 对方正在移动时，导航目的地只是对方最后一次位置。
4. UI 必须提示“对方可能已经移动”。

---

### 5.6 罗盘方向和距离

方向指针模式用于显示“对方在哪个方向”。

输入数据：

1. 自己当前位置。
2. 对方当前位置。
3. 自己设备朝向。
4. IMU / 罗盘数据。

输出显示：

1. 指向对方的箭头。
2. 对方距离。
3. 对方显示姓名。
4. 数据更新时间。
5. 精度提示。

计算逻辑：

1. 根据两点经纬度计算目标方位角。
2. 获取当前设备朝向。
3. 目标方位角减去当前设备朝向。
4. 得到屏幕上箭头旋转角度。
5. 根据两点距离显示米或公里。

显示规则：

```text
0 到 999 米：显示 m
1 公里以上：显示 km
位置精度差：显示“精度较低”
罗盘不可用：显示“方向不可用，仅显示距离”
```

---

### 5.7 UWB 精准指向

UWB 只在 App 端实现。

启用条件：

1. 当前设备支持 UWB。
2. 对方设备支持 UWB。
3. 双方都安装 App。
4. 双方都允许相关权限。
5. 双方距离足够近。
6. 双方处于同一房间。
7. 双方完成近距离连接协商。

UWB 能力：

1. 更精准的相对距离。
2. 更精准的相对方向。
3. 适合近距离找人。
4. 适合室内或复杂环境下的最后几十米寻找。

限制：

1. 并非所有 Android 设备支持 UWB。
2. 不同厂商设备兼容性需要验证。
3. UWB 不能替代 GPS 地图定位。
4. UWB 适合近距离，不适合远距离。
5. Web 不作为 UWB 实现平台。

---

### 5.8 蓝牙距离 fallback

当 UWB 不可用时，App 端使用蓝牙估算距离。

启用条件：

1. App 已安装。
2. 用户允许蓝牙权限。
3. 双方设备开启蓝牙。
4. 双方在同一房间。
5. 双方靠近到蓝牙可发现范围内。

蓝牙能力：

1. 可判断对方是否接近。
2. 可通过 RSSI 粗略估算距离。
3. 可辅助“越来越近 / 越来越远”的提示。

限制：

1. 蓝牙 RSSI 不稳定。
2. 室内反射会影响结果。
3. 人体遮挡会影响结果。
4. 不同手机发射功率不同。
5. 不应显示过于精确的米级结论。

推荐显示：

```text
很近
较近
较远
信号弱
距离估算不稳定
```

不推荐显示：

```text
精确 1.2 米
精确 2.5 米
```

---

## 6. 后端设计

### 6.1 技术选型

优先使用 Firebase / GCP。

建议组件：

```text
Firebase Hosting
Firebase Firestore
Firebase Realtime Database
Firebase Cloud Functions
Firebase App Check
Google Maps Platform
Cloud Scheduler
Cloud Storage
```

职责划分：

```text
Firebase Hosting：部署 Web
Firestore：保存房间、成员、轨迹摘要、配置
Realtime Database：保存在线状态和实时位置
Cloud Functions：创建房间、清理过期数据、校验写入
App Check：降低非法客户端调用风险
Google Maps Platform：地图显示和导航
Cloud Scheduler：定时清理过期房间和轨迹
```

---

### 6.2 数据结构

#### rooms

```text
rooms/{roomId}
```

字段：

```json
{
  "roomId": "string",
  "createdAt": "timestamp",
  "expiresAt": "timestamp",
  "status": "active | expired | closed",
  "maxMembers": 20,
  "trackRetentionMinutes": 1440,
  "createdByDeviceId": "string"
}
```

---

#### roomMembers

```text
rooms/{roomId}/members/{deviceId}
```

字段：

```json
{
  "deviceId": "string",
  "displayName": "string",
  "joinedAt": "timestamp",
  "lastSeenAt": "timestamp",
  "online": true,
  "sharingLocation": true,
  "platform": "web | android | ios",
  "capabilities": {
    "location": true,
    "imu": true,
    "compass": true,
    "uwb": false,
    "ble": false
  }
}
```

---

#### liveLocations

推荐放在 Realtime Database。

路径：

```text
liveLocations/{roomId}/{deviceId}
```

字段：

```json
{
  "deviceId": "string",
  "displayName": "string",
  "lat": 35.0,
  "lng": 139.0,
  "accuracy": 10,
  "heading": 90,
  "speed": 1.2,
  "updatedAt": 1710000000000,
  "sharingLocation": true
}
```

---

#### tracks

轨迹 MVP 放在 Firestore。

路径：

```text
rooms/{roomId}/tracks/{deviceId}/points/{pointId}
```

字段：

```json
{
  "lat": 35.0,
  "lng": 139.0,
  "accuracy": 10,
  "heading": 90,
  "speed": 1.2,
  "createdAt": "timestamp",
  "segmentKind": "stopped | slow | moving | fast"
}
```

轨迹点 ID 建议：

```text
时间戳 + 随机后缀
```

轨迹读取策略：

1. 实时地图位置仍然只监听 RTDB `liveLocations/{roomId}/{deviceId}`。
2. 轨迹不全房间实时监听。
3. 点击某个成员后，再按需读取该成员轨迹：

```text
rooms/{roomId}/tracks/{targetDeviceId}/points
where createdAt >= now - 24h
orderBy createdAt asc
```

轨迹写入策略：

1. 前端不直接写 Firestore 轨迹集合。
2. 前端通过 Cloud Functions 写入自己的轨迹点。
3. Cloud Functions 校验 `roomId + deviceId + deviceSecret`。
4. 设备只能写自己的 `rooms/{roomId}/tracks/{deviceId}/points/{pointId}`。
5. 默认轨迹保留 24 小时。
6. 超过 24 小时的轨迹点通过 Firestore TTL 或定时清理函数删除。

---

#### deviceSessions

设备本地凭证对应的服务端会话信息。

路径：

```text
rooms/{roomId}/deviceSessions/{deviceId}
```

字段：

```json
{
  "deviceId": "string",
  "secretHash": "string",
  "createdAt": "timestamp",
  "lastVerifiedAt": "timestamp"
}
```

说明：

1. `deviceSecret` 不应明文保存。
2. 服务端只保存 hash。
3. 客户端写入敏感数据时附带校验信息。
4. v0 可简化，后续补强。

---

## 7. 前端设计

### 7.1 Web 技术建议

建议：

```text
TypeScript
React
Vite
Google Maps JavaScript API
Firebase Web SDK
Zustand 或 Redux Toolkit
CSS Modules 或 Tailwind CSS
```

移动端优先：

1. 使用响应式布局。
2. 主要断点围绕手机屏幕设计。
3. 地图全屏。
4. 关键操作放底部。
5. 成员列表使用底部抽屉。
6. 方向指针使用独立模式或底部面板。

---

### 7.2 页面结构

推荐页面：

```text
启动页
姓名输入页
创建 / 加入房间页
地图主页面
成员详情面板
方向指针页面
权限说明页面
错误页面
```

---

### 7.3 地图主页面布局

结构：

```text
顶部状态栏
↓
Google Map
↓
地图浮动按钮
↓
底部成员列表
↓
底部详情面板
```

顶部状态栏显示：

1. 房间状态。
2. 在线人数。
3. 共享状态。
4. 网络状态。

地图浮动按钮：

1. 回到自己位置。
2. 复制邀请链接。
3. 开启 / 停止共享。
4. 显示 / 隐藏轨迹。

底部成员列表：

1. 自己。
2. 其他在线成员。
3. 最近离线成员。

---

### 7.4 权限处理

需要请求的权限：

1. 位置权限。
2. 方向传感器权限。
3. 运动传感器权限。

原则：

1. 先解释用途，再请求权限。
2. 权限被拒绝后显示可理解的说明。
3. 不要反复弹权限请求。
4. 用户可以在无 IMU 情况下继续使用地图。
5. 用户可以在无罗盘情况下继续查看距离。
6. 用户不允许定位时，不能上传位置。

---

## 8. Android 设计

### 8.1 技术建议

建议：

```text
Kotlin
Jetpack Compose
Firebase Android SDK
Google Maps SDK for Android
Fused Location Provider
SensorManager
UWB Jetpack Library
Bluetooth LE
Foreground Service
WorkManager
```

---

### 8.2 Android 页面

页面结构与 Web 保持一致：

```text
姓名输入
创建 / 加入房间
地图主页面
成员详情
方向指针
近距离寻找
权限说明
```

---

### 8.3 Android 权限

可能涉及：

```text
ACCESS_FINE_LOCATION
ACCESS_COARSE_LOCATION
ACCESS_BACKGROUND_LOCATION
BLUETOOTH_SCAN
BLUETOOTH_CONNECT
BLUETOOTH_ADVERTISE
UWB_RANGING
POST_NOTIFICATIONS
FOREGROUND_SERVICE_LOCATION
```

注意：

1. 权限必须按需请求。
2. 后台位置必须明确说明。
3. 蓝牙权限必须解释用途。
4. UWB 权限必须在设备支持时才请求。
5. 通知权限用于显示正在共享位置。

---

### 8.4 实现状态（截至当前）

已实现（`apps/android`，Kotlin + Jetpack Compose）：

1. 姓名输入、创建/加入房间（复用 asia-northeast1 的 Cloud Functions）、Google 地图、
   成员列表/详情、距离、Google 导航、罗盘方向指针、改名、历史房间、共享开关、
   查看所有人、track 取景、按速度渐变的彩色轨迹、地图旋转 + 指南针(heading-up)、
   自适应轨迹采样、震动反馈、edge-to-edge。
2. **后台持续共享位置**：前台服务 `LocationSharingService`（`foregroundServiceType=location`），
   独立持有 Fused 定位采集 + 实时位置(RTDB)/轨迹(Functions)上传 + 常驻通知；在前台启动以
   适用「前台服务定位豁免」，配合系统「始终允许」后台定位可长时间后台运行。VM 不再自行采集，
   `ownLocation` 由成员实时数据回显推导。
3. **能力检测**：UWB（`android.hardware.uwb` + Android 12+）、BLE（`FEATURE_BLUETOOTH_LE`）
   真实检测并写入成员 `capabilities`，跨端可见（网页能力标签据此显示）。

近距离 UWB / 蓝牙测距（**计划，尚未实现**）：

1. 触发条件：双方同房间、彼此 `capabilities` 支持、距离足够近（先用 GPS 距离粗判）。
2. 带外协商（OOB）：通过现有后端做信令（如 RTDB `rooms/{roomId}/nearby/{deviceId}`）
   交换 UWB 地址/会话参数或 BLE 标识。
3. UWB：`androidx.core.uwb`（alpha）建立 ranging session → 精准相对距离/方向；仅双方都支持时。
4. BLE fallback：广播房间内标识 + 扫描，RSSI → 粗略距离桶（很近/较近/较远/信号弱），
   不展示精确米数（见 §5.8）。
5. 权限：`BLUETOOTH_SCAN/CONNECT/ADVERTISE`、`UWB_RANGING` 按需、仅在设备支持时请求。

---

## 9. UI 风格

### 9.1 设计方向

风格关键词：

```text
地图优先
清晰
轻量
现代
移动端友好
低学习成本
高可读性
方向感强
```

---

### 9.2 颜色建议

建议设计 token：

```text
主色：蓝色系
成功：绿色
警告：橙色
危险：红色
离线：灰色
自己：蓝色
目标：紫色或高亮色
轨迹：半透明线条
```

---

### 9.3 图标规则

需要图标：

1. 自己位置。
2. 对方位置。
3. 在线状态。
4. 离线状态。
5. 共享中。
6. 未共享。
7. 导航。
8. 方向。
9. 轨迹。
10. UWB。
11. 蓝牙。
12. 定位精度低。

---

### 9.4 交互规则

1. 地图点击不应误触关键按钮。
2. 底部成员列表可横向滑动。
3. 点击成员后展开详情。
4. 方向指针模式必须一眼能看懂。
5. 导航按钮必须避免误触。
6. 停止共享必须明显。
7. 房间链接复制后要有反馈。
8. 网络断开时要有明显提示。

---

## 10. MVP 范围

### 10.1 MVP 必须做

第一版必须包含：

1. Web 手机浏览器版。
2. 输入显示姓名。
3. 本地生成 `deviceId`。
4. 创建房间。
5. 加入房间。
6. 邀请链接。
7. 获取当前位置。
8. 上传实时位置。
9. 显示自己在地图上。
10. 显示其他在线成员在地图上。
11. 地图外成员列表。
12. 点击成员查看详情。
13. 查看距离。
14. Google Maps 导航跳转。
15. 基础轨迹记录。
16. 基础轨迹显示。
17. 开启 / 停止位置共享。
18. 在线 / 离线状态。
19. 房间过期。
20. UTF-8 和 commit 规范。

---

### 10.2 MVP 可以暂缓

可以后续实现：

1. Android App。
2. UWB 精准指向。
3. 蓝牙距离估算。
4. iOS App。
5. 复杂轨迹回放。
6. 成员头像上传。
7. 自定义房间设置。
8. 房间管理员能力。
9. 长时间后台共享。
10. 多主题 UI。
11. 复杂隐私控制。
12. 轨迹导出。

---

## 11. 关键技术风险

### 11.1 没有账号体系的安全风险

风险：

1. 房间链接泄露后，别人可以加入。
2. 设备本地数据被清除后，会变成新设备。
3. 难以确认真实身份。
4. 难以做强权限控制。

对策：

1. `roomId` 使用高随机值。
2. 房间默认短期有效。
3. 用户可以重新创建房间。
4. 显示所有成员，便于发现陌生设备。
5. 后续可添加房间口令，但不作为账号体系。
6. 使用 `deviceSecret` 防止简单伪造同一设备。
7. 使用 Firebase App Check 降低非正常客户端调用。

---

### 11.2 Web 传感器不稳定

风险：

1. 某些浏览器无法获取罗盘。
2. 某些系统需要额外权限。
3. 罗盘受磁场影响。
4. IMU 数据可能抖动。

对策：

1. 做能力检测。
2. 做权限说明。
3. 做数据平滑。
4. 无罗盘时只显示距离。
5. 方向指针显示精度提示。
6. 不把 Web 方向指针宣传为绝对精准。

---

### 11.3 室内定位不稳定

风险：

1. GPS 室内精度差。
2. 商场、高楼、地下空间误差大。
3. 地图位置可能跳动。

对策：

1. 显示定位精度。
2. 位置精度低时提示。
3. App 端引入 UWB / 蓝牙补充。
4. 轨迹做平滑。
5. 不在 Web 端承诺室内精准定位。

---

### 11.4 UWB 设备支持率

风险：

1. 并非所有手机支持 UWB。
2. Android 设备支持情况差异大。
3. UWB 跨厂商体验需要验证。
4. iOS UWB 实现限制较多。

对策：

1. UWB 作为 App 端增强能力。
2. 必须先做能力检测。
3. UI 明确显示是否支持 UWB。
4. 不支持时 fallback 到蓝牙距离。
5. 蓝牙只做粗略距离，不做精准方向。

---

## 12. 推荐项目结构

建议 Monorepo：

```text
project-root/
  AGENTS.md
  design.md
  README.md
  apps/
    web/
    android/
    ios/
  packages/
    shared-types/
    shared-ui/
    geo-utils/
  firebase/
    functions/
    firestore.rules
    database.rules.json
  docs/
    ui/
    api/
    firebase/
```

说明：

```text
apps/web：Web 手机浏览器版
apps/android：Android App
apps/ios：未来 iOS App
packages/shared-types：共享数据类型
packages/shared-ui：共享设计 token 和 UI 规则
packages/geo-utils：距离、方位角、轨迹处理
firebase/functions：Cloud Functions
docs：补充文档
```

---

## 13. 地理计算工具

需要实现通用地理工具：

1. 两点距离计算。
2. 两点方位角计算。
3. 方向角归一化。
4. 轨迹抽稀。
5. 位置精度判断。
6. 速度估算。
7. 位置过期判断。

核心函数建议：

```text
calculateDistance(from, to)
calculateBearing(from, to)
normalizeAngle(angle)
calculateRelativeDirection(targetBearing, deviceHeading)
isLocationStale(updatedAt)
isAccuracyPoor(accuracy)
simplifyTrack(points)
```

---

## 14. 状态管理

核心状态：

```text
deviceState
roomState
locationState
membersState
mapState
sensorState
connectionState
uiState
```

说明：

```text
deviceState：当前设备 ID、显示姓名、本地能力
roomState：当前房间、邀请链接、过期状态
locationState：自己位置、定位权限、共享状态
membersState：其他成员、在线状态、实时位置
mapState：地图中心、选中成员、轨迹显示
sensorState：罗盘、IMU、方向角
connectionState：网络连接、Firebase 连接状态
uiState：面板展开、错误提示、加载状态
```

---

## 15. Firebase 安全规则方向

安全规则目标：

1. 只能访问自己加入的房间。
2. 只能写自己的成员信息。
3. 只能写自己的实时位置。
4. 只能写自己的轨迹。
5. 不能修改其他成员。
6. 不能修改已过期房间。
7. 轨迹写入需要限制频率。
8. 房间创建需要限制滥用。

由于无账号体系，规则需要结合：

1. 高随机 `roomId`。
2. 本地 `deviceId`。
3. 本地 `deviceSecret`。
4. Cloud Functions 校验。
5. App Check。

MVP 可先简化，后续必须补强。

---

## 16. 开发阶段规划

### Phase 0：项目初始化

目标：

1. 建立项目结构。
2. 建立 AGENTS.md。
3. 建立 design.md。
4. 建立 Web 项目。
5. 建立 Firebase 项目配置。
6. 建立基础设计 token。
7. 建立基础类型定义。

完成后 commit。

---

### Phase 1：Web MVP 骨架

目标：

1. 姓名输入。
2. 设备初始化。
3. 创建房间。
4. 加入房间。
5. 地图页面骨架。
6. 成员列表骨架。

完成后 commit。

---

### Phase 2：实时位置

目标：

1. 请求位置权限。
2. 获取当前位置。
3. 上传实时位置。
4. 监听其他成员位置。
5. 地图显示成员。
6. 在线状态。

完成后 commit。

---

### Phase 3：轨迹和导航

目标：

1. 记录自己的轨迹。
2. 显示自己的轨迹。
3. 显示对方轨迹。
4. 跳转 Google Maps 导航。
5. 位置过期提示。

完成后 commit。

---

### Phase 4：方向指针

目标：

1. 获取罗盘 / IMU。
2. 计算目标方位角。
3. 显示方向指针。
4. 显示距离。
5. 处理传感器不可用状态。

完成后 commit。

---

### Phase 5：Android App

目标：

1. Android 项目初始化。
2. 复用设计 token。
3. 实现地图。
4. 实现位置共享。
5. 实现方向指针。
6. 与 Web 后端数据互通。

完成后 commit。

---

### Phase 6：UWB / 蓝牙

目标：

1. Android UWB 能力检测。
2. UWB 近距离测距和方向。
3. 蓝牙扫描。
4. 蓝牙 RSSI 距离估算。
5. UWB 不可用时 fallback。
6. UI 显示能力状态。

完成后 commit。

---

### Phase 7：iOS 移植

目标：

1. iOS 技术验证。
2. iOS UI 对齐。
3. iOS 定位和传感器。
4. iOS 导航跳转。
5. iOS 近距离能力评估。

完成后 commit。

---

## 17. 待确认事项

以下事项后续需要确认：

1. 房间默认有效期是多久。
2. 轨迹默认保存多久。
3. 房间最大人数是多少。
4. 是否允许用户手动踢出陌生设备。
5. 是否需要房间口令。
6. 是否需要显示历史离线成员。
7. 是否需要轨迹回放。
8. 是否需要多人同时显示轨迹。
9. 是否需要后台持续共享位置。
10. Android App 是否必须支持 Google Play 以外安装。
11. 是否需要日本市场优先的隐私文案。
12. 是否需要中日英多语言。
13. 是否需要 PWA。
14. 是否需要离线缓存地图。
15. 是否需要把数据完全匿名化。

---

## 18. 当前明确结论

当前确定：

1. 不做账号体系。
2. 不做登录。
3. 不做注册。
4. 用户只输入显示姓名。
5. 当前设备就是一个用户。
6. 使用 `deviceId` 区分设备。
7. Web 手机浏览器优先。
8. Android App 第二阶段。
9. iOS 后期移植。
10. Web 和 App UI 风格保持一致。
11. 后端优先 Firebase / GCP。
12. 地图使用 Google Maps。
13. Web 获取系统融合定位结果。
14. Web 结合 IMU / 罗盘做方向指针。
15. Web 显示行动轨迹。
16. Web 显示其他在线用户。
17. 地图外也显示其他用户图标或列表。
18. 点击对方后显示轨迹、导航、方向和距离。
19. App 额外支持 UWB。
20. 不支持 UWB 时使用蓝牙显示粗略距离。
21. 每次修改完成后必须 commit。
22. 所有文件读写必须使用 UTF-8。
