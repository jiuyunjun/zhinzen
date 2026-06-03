# Zhinzen · 位置共享 / Live Location Sharing

和身边的人，实时互相找到。无需注册、无需登录 —— **这台设备就是你**。

> Find the people right around you, live. No sign-up, no login — **this device is you.**

Zhinzen 是一个移动端优先的实时位置共享产品：两人及以上通过一个房间互相看到对方的
位置、距离、方向和移动轨迹。详见 [`design.md`](./design.md) 与 [`agents.md`](./agents.md)。

---

## 核心原则

- **无账号体系** —— 不注册、不登录、不收集邮箱/手机号/密码。
- **设备即用户** —— 客户端本地生成 `deviceId` + `deviceSecret` 作为参与者凭证。
- **房间即共享空间** —— 通过高随机 `roomId` 的邀请链接加入，房间可过期、可离开。
- **平台顺序** —— Web 手机浏览器优先 → Android App → iOS App，UI 风格保持一致。
- **后端** —— Firebase / GCP（Firestore + Realtime Database + Cloud Functions）+ Google Maps Platform。

## 仓库结构（Monorepo）

```text
.
├── apps/
│   └── web/              # Web 手机浏览器版（Vite + React + TS）—— 优先实现
├── packages/
│   ├── shared-types/     # 共享数据类型（房间 / 成员 / 位置 / 轨迹）
│   ├── geo-utils/        # 距离、方位角、相对方向、过期/精度判断、轨迹抽稀
│   └── shared-ui/        # 设计 token（颜色、字体、地图主题、状态色）
├── firebase/             # firestore.rules / database.rules.json / functions
├── docs/
│   └── ui/prototype/     # Claude Design 交付的高保真交互原型（视觉参考）
├── design.md             # 产品与技术设计
└── agents.md             # Agent 协作与工程规范
```

> 未来的 `apps/android/`、`apps/ios/` 会复用 `packages/*` 的类型、几何工具与设计 token。

## 开发

需要 Node.js ≥ 20。本仓库使用 **npm workspaces**。

```bash
npm install          # 安装所有 workspace 依赖
npm run dev          # 启动 Web 开发服务器 (apps/web)
npm run build        # 构建所有 workspace
npm run typecheck    # 全仓库类型检查
```

## 设计原型

`docs/ui/prototype/` 是 [Claude Design](https://claude.ai/design) 导出的可点击高保真原型
（React + Babel，浏览器内运行），作为 `apps/web` 实现的视觉与交互参考，不是生产代码。
直接用浏览器打开 `docs/ui/prototype/Zhinzen 位置共享原型.html` 即可预览。

## 工程规范（摘要）

- 所有文件读写一律 **UTF-8**。
- 每完成一个独立修改点即 **commit**，遵循 [Conventional Commits](https://www.conventionalcommits.org/)。
- 不引入账号 / 登录 / 注册概念；不在前端写死任何 Firebase 管理密钥。

完整规范见 [`agents.md`](./agents.md)。

## 开发阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| Phase 0 | 项目初始化（结构、Web 脚手架、Firebase 配置、token、类型） | ✅ 进行中 |
| Phase 1 | Web MVP 骨架（姓名输入、设备初始化、创建/加入房间、地图骨架） | ⬜ |
| Phase 2 | 实时位置（权限、上传、监听、地图显示、在线状态） | ⬜ |
| Phase 3 | 轨迹与导航（记录/显示轨迹、Google Maps 导航、过期提示） | ⬜ |
| Phase 4 | 方向指针（罗盘/IMU、方位角、距离、传感器降级） | ⬜ |
| Phase 5+ | Android App、UWB / 蓝牙、iOS 移植 | ⬜ |
