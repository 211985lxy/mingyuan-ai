# @mingyuan/desktop

明源AIM 的 macOS 桌面客户端 —— Tauri 2 **壳模式**，作为带原生窗口的 webview，直接加载已部署的云端 Next.js 应用（`@mingyuan/web`）。后端零改动。

## 加载的地址

| 场景 | URL |
| --- | --- |
| `tauri dev`（debug） | `http://localhost:3000` |
| `tauri build`（release） | `https://mingyuan-ai.com` |
| 环境变量 `MINGYUAN_WEB_URL` | 覆盖以上默认值 |

## 常用命令

在仓库根目录执行：

```bash
# 生成 App 图标（源：apps/web/public/logo.png）
pnpm icon:desktop

# dev 联调（需另起 pnpm dev:web；或用根 pnpm dev 同时起两者）
pnpm dev:desktop

# 生产构建（产出未签名 .app / .dmg）
pnpm build:desktop
```

产物位置：`apps/desktop/src-tauri/target/release/bundle/macos/明源AIM.app`

## 首次打开（未签名）

未签名 `.app` 首次会被 Gatekeeper 拦截，二选一绕过：

- Finder 右键 → 打开 → “打开”（永久放行）
- 或：`xattr -dr com.apple.quarantine /path/to/明源AIM.app`

## 原生能力

- 系统托盘（“显示主窗口” / “退出”），左键单击托盘图标显示窗口
- 关闭窗口 → 最小化到托盘（不退出进程）
- 窗口大小/位置记忆（`tauri-plugin-window-state`）
- 原生应用菜单（App / 编辑 / 窗口）

## 不在当前范围

Windows / Linux 构建、Apple 签名 + 公证、`tauri-plugin-updater` 自动更新、外部链接同源守卫、断网兜底探测。
