# Android UWB 验证

## 使用条件

两台 Android 12+ UWB 手机安装同一新版客户端，开启系统 UWB、授予附近设备权限，
加入同一房间并开启共享。在两边互相打开成员详情，保持 App 前台。连接后显示米数；
设备提供 azimuth 时显示相对方向，否则显示“方向不可用”。关闭共享也停止 BLE 广播/扫描。

目前沿用 Jetpack UWB alpha08 和 profile 1 STATIC STS。RTDB 信令仍是原项目的公开路径，
未提供身份认证安全性；不适合安全敏感用途，后续需要服务端设备凭证校验与安全 OOB。

## 自动检查

在 apps/android 运行（JDK 17+）：

```powershell
./gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

本次工作区缺少 `app/google-services.json`，实际验证命令额外使用
`-x :app:processDebugGoogleServices`。编译、Lint 和 5 项单元测试通过。
这种构建只能证明源码可编译，不能当成已配置 Firebase 的可用安装包交付。
恢复项目 Firebase 配置后必须重新完整构建。没有进行真机射频验证。

单元测试覆盖无效/缺失测量值、会话切换先停止旧任务、等待超时、失去样本后停止硬件，以及新节点删除后不复用旧应答。

## 双机验收（待执行）

1. 两边以不同顺序打开详情，30 秒内握手成功；分别验证 controller/controlee 两种角色。
2. 前方、左侧、右侧各测 1/3/5 米，记录设备型号、系统版本、实测距离、方向误差。
3. 无角度设备只显示距离；不能拿 GPS/罗盘方向冒充 UWB 方向。
4. 关闭一端 UWB、遮挡/离开范围：无有效样本 8 秒后清空精准结果，显示超时并保留 BLE 估距。
5. 切换第三位成员、关闭详情、停止共享、离房、退后台：旧会话终止，不显示上位成员结果。
6. 恢复前台/重新打开详情可以新建会话；拒绝权限不自动反复请求。
7. 断网/杀进程：检查本次 attempt 经 onDisconnect 删除；恢复后旧节点不能完成新会话握手。
8. RTDB 观察 v2 下仅删除本机 attempt，快速重新打开详情不得误删新会话。

会话节点绑定双方独立 attemptId；30 秒握手超时，8 秒样本超时。数据不作为轨迹保存。
房间到期由已有 pruneExpiredRooms 删除 rooms/{roomId}。旧 v1 客户端不能参与 v2 测距。
