# 密钥与配置清单 / Secrets & Config

> 这些文件**不在 git 里**(已 gitignore)。换电脑 / 新克隆 / 重装系统后必须手动补齐,
> 所以请把它们**单独备份**(密码管理器 / 安全笔记 / 私有加密存储)。
>
> 重要区分:本项目目前**没有"服务器机密"**(没有 service account、没有 CI token)。
> 下面这些大多是**客户端配置**——它们本来就会打进网页 bundle / APK,属于公开标识,
> 真正的安全靠 **Firebase 安全规则 + API key 的来源/应用限制**。所以"单独存"主要是为了
> **可复现构建**,而不是怕泄露。唯一要当心的是别把它们配成"无限制"的 key。

---

## 一图流:需要单独存的文件

| # | 文件 | 平台 | 内容 | git |
|---|------|------|------|-----|
| 1 | `.env.local`(仓库根) | Web | Firebase web 配置 + Maps JS key + Map ID | 忽略 |
| 2 | `apps/android/local.properties` | Android | `MAPS_API_KEY`(+ `sdk.dir` 机器相关) | 忽略 |
| 3 | `apps/android/app/google-services.json` | Android | Firebase Android 配置(整文件) | 忽略 |
| 4 | *(以后)* `GoogleService-Info.plist` | iOS | Firebase iOS 配置 | 尚未有 |

> 模板:根目录 `.env.example`、`apps/android/local.properties.example` 已提交,
> 照着填即可。

---

## 1. Web —— `.env.local`(仓库根目录)

来源:Firebase 控制台 → 项目设置 → 常规 → 你的应用(Web)→ SDK 配置;Maps 在 GCP 控制台。

```
VITE_MAPS_API_KEY          Google Maps JavaScript API key(限制:HTTP referrer + 只勾 Maps JavaScript API)
VITE_MAPS_MAP_ID           矢量 Map ID(启用地图旋转 / 指南针;GCP → Maps → Map Management)
VITE_FIREBASE_API_KEY      Firebase web apiKey(公开标识,非机密)
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID   zhinzen
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_DATABASE_URL RTDB 实例 URL(zhinzen-live,asia-southeast1)
VITE_USE_FIREBASE_EMULATORS=false
```

`VITE_*` 全部会被打进前端 bundle,本就是公开的;安全靠规则 + key 限制。

## 2. Android —— `apps/android/local.properties`

```
sdk.dir=...        Android SDK 路径(每台机器不同,不用备份)
MAPS_API_KEY=...   Maps SDK for Android key →（构建时注入 AndroidManifest 的 geo.API_KEY)
```

`MAPS_API_KEY` 这把 key 必须在它所属 GCP 项目里**启用 "Maps SDK for Android"**;
若设了应用限制,要加包名 `com.lazydoglab.zhinzen` + 调试 SHA-1。
(网页那把是 "Maps JavaScript API",两者是不同的 API,可同 key 但都要分别启用。)

## 3. Android —— `apps/android/app/google-services.json`

整份文件来自 Firebase 控制台 → 项目设置 → 你的应用(Android)→ 下载 `google-services.json`。
里面有 `project_id` / `mobilesdk_app_id` / Android `api_key`。属客户端配置,非服务器机密,
但 Android key 同样建议加包名 + SHA-1 限制。

---

## 签名密钥库(App Links / 发版会用到)

- **debug keystore**(`~/.android/debug.keystore`,Android Studio 自动生成):其 SHA-256 已写进
  `apps/web/public/.well-known/assetlinks.json`,用于 App Links 验证。换电脑会变,需重新生成并更新 assetlinks。
- **release keystore**(发版用,目前还没有):**这是真正必须单独保管的密钥** —— 丢了就无法给同一个
  App 发更新。生成后:① keystore 文件 + 口令存密码管理器;② 把它的 SHA-256 追加进 assetlinks.json;
  ③ keystore 放 gitignored 路径。

## 真正算"机密"的(目前都没有,但将来要注意)

- **service account JSON**(`serviceAccountKey*.json`):服务端 / Admin SDK / CI 用。已 gitignore。**绝不入库**,只存密码管理器。
- **Firebase CI token / `GOOGLE_APPLICATION_CREDENTIALS`**:若以后做 CI 自动部署才需要。
- 现在部署用的是本机 `firebase login` 的登录态,没有落地机密文件。

---

## 校验:确认没把密钥提交进 git

```bash
git ls-files | grep -E "google-services.json|local.properties|\.env(\.|$)|serviceAccount"
# 应当为空(.env.example 除外)
```

发版/泄露后轮换:在 GCP/Firebase 控制台重建对应 key 或 service account,更新上述文件即可——
无需改代码。
