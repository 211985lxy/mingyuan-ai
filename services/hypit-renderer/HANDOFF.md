# HANDOFF — Hypit 渲染后端

> 收尾时间：2026-09-16 · 状态：**已交付并验收通过（macOS 31/31）· 容器镜像已在 Linux 内实测通过**

> **位置已变**：本服务最初建在临时目录 `~/WorkBuddy/Worktrees/明动aim智能体/main-2b9f742b/hypit-backend/`，
> 现已迁入 AIM 仓库 `mingyuan/.worktrees/hypit-renderer/services/hypit-renderer/`
> （分支 `feat/hypit-renderer-integration`）。本文档随代码一起搬来，剩余路径引用以本目录为准。
>
> 容器化相关的四个 Linux 专有坑与验收证据见
> [`docs/ACCEPTANCE-CONTAINER.md`](docs/ACCEPTANCE-CONTAINER.md)；容器怎么起见 README。

## 1. 任务背景

把本机安装的 Hypit（AI 视频生产系统，SVML DSL + Runtime）封装成 HTTP 接口，作为"自家网站后端"的
渲染/生成引擎调用。单租户、内部使用。硬性要求：subprocess 调 CLI、build 必须异步、API Token 鉴权、
遵守 hypit 修改版 Apache-2.0 许可（不做多租户/转售、保留版权信息）、防路径穿越与命令注入。

## 2. 已完成

- **后端服务** `hypit-backend/`（FastAPI + uvicorn），19 个端点：
  health / builds(提交·列表·状态·inspect·logs·cancel·activity) / jobs / outputs(history·download·probe)
  / preview(plans·checks·pricing)。
- **异步提交模型**：`POST /builds` 后台队列 → 返回 buildId（201）或 jobId（202），永不等待渲染；
  `--follow` 全程未使用。job 状态落盘，重启后与 `hypit builds` 对账恢复。
- **安全**：X-API-Token（常量时间比较，未配置则 503 fail-closed）、全参数数组无 shell、
  source realpath + 允许根 + 后缀三重校验、日志脱敏、每次调用有超时。
- **macOS 26 `ps` 垫片** `bin/ps`（libproc 实现，源码 `tools/ps-shim/ps.c`）——没有它本地渲染 100% 失败。
- **零成本验收工程** `smoke/`（1080×1920 / 6s / 180 帧，全本地 provider，`providerRequestCount: 0`）。
- **文档**：`README.md`（启动 + 配置 + 端点表 + 许可边界）、`docs/API.md`（逐端点请求/响应示例）、
  `docs/ACCEPTANCE.md`（环境问题与修复，含复现命令）、`docs/ACCEPTANCE-RUN.md`（自动生成的验收记录）。
- **验收脚本** `scripts/e2e.py`，`--start-server` 一键跑完全流程并重新生成记录。

## 3. 当前状态

- 服务可运行：`./run.sh`（读取 `.env`，端口 8787，仅绑 127.0.0.1）。
- `.env` 已生成随机 Token（`chmod 600`，已 gitignore）。
- 依赖装在项目内 `.venv`，未污染全局 Python。
- 最终验收：提交 → 轮询到 `complete` → 导出 132 152 字节 MP4（ffprobe：h264 1080×1920 30fps
  180 帧 + AAC，6.000s）→ 全部断言通过。
- 用户的正式 Runtime（hypit-repo 的 profile）未被改动：doctor ok、worker running、3 programs ready。

## 4. 下一步（未做，需要时再动）

1. **接入网站前端的实际调用链**——目前只验证了 API 本身，还没有接到明动/AFU 的实际页面或任务系统。
2. **用真实付费 Run 跑一次**——建议从 `examples/ranking-football/reference.svrun` 开始，但先
   `POST /api/v1/pricing` 看 Provider 报价，并明确预算后再 `POST /api/v1/builds`。本次验收**没有**调用
   volcark / hypihub 付费生成。
3. **进程守护**——现在是 `./run.sh` 前台。要常驻需要 launchd plist 或 supervisor。
4. **可选的 Swagger "Authorize" 体验**——已声明 APIKeyHeader 安全方案，但未把 `Authorization: Bearer`
   也做成 scheme；如需两种都能在 /docs 里试，再补一个 HTTPBearer。
5. **多实例部署不可行**——本设计是单进程内存队列 + 单文件状态。要横向扩容得先换队列（见第 6 节）。

## 5. 踩坑记录

| 现象 | 真正原因 | 处理 |
| --- | --- | --- |
| 本地渲染在收尾阶段失败：`Render cleanup failed; Error: spawn EPERM` | macOS 26 拒绝 Node 子进程 `spawn("/bin/ps")`；hypit 的 `killRenderTree()` 依赖 `ps -A -o pid=,ppid=` 和 `ps -p <pid> -o stat=` 两种形状 | C 版 libproc 垫片 `bin/ps`，仅前置到 hypit 子进程 PATH |
| 帧都渲染完了却报 `Render process <pid> did not stop after SIGKILL` | 垫片最初只实现了第一种 `ps` 形状，第二种返回整张表 → 清理循环空转到超时 | 垫片补 `-p <pid> -o stat=`（gone 时输出空） |
| `Cannot find package '@hypit/hyperframes'` / `'@hyperframes/engine'` | npm 全局包 `@hypit/hypit@0.1.8` 仍声明 `workspace:*`，全局 node_modules 里没有 `@hypit/` scope；**Worker 由哪个 CLI 拉起，就用哪个 CLI 的包树** | `HYPIT_BIN` 指向 checkout launcher；一个 Runtime 只用一个 CLI，切换前 `hypit runtime down` |
| `Source ... is outside workspace root ...` | hypit 按最近 `package.json` 定项目边界 | 显式 `--workspace`；后端 `HYPIT_WORKSPACE` |
| SVML 里 `source="../xxx.svs"` 找不到文件 | `<import source>` / `asset src` 不吃 `../` | 源文件改扁平结构 |
| `@fontsource-variable/inter is needed` | 非固定内置字体要走 `hypit packages install`（机器级联网安装） | 验收工程避开字体，用本地 jpg + media-track |
| 所有路由返回 422 `missing: settings, payload` | FastAPI 把依赖函数里的裸注解参数 `settings: Settings` 当成必填 body 字段 | 依赖内改从 `request.app.state.settings` 取 |
| 下载是 `application/octet-stream` | 逻辑输出名 `final.video` 没有可用扩展名 | 按字节嗅探（`ftyp` 等）决定 media type，文件名补 `.mp4` |

## 6. 新对话启动指南

**先读**（按顺序）：

1. `hypit-backend/README.md` —— 是什么、怎么跑、配置项、许可边界。
2. `hypit-backend/docs/ACCEPTANCE.md` —— 三个环境级结论，**不要重复踩**。
3. `hypit-backend/docs/API.md` —— 端点契约。

**快速确认环境是否还健康**：

```sh
cd /Users/xiangyu/WorkBuddy/Worktrees/明动aim智能体/main-2b9f742b/hypit-backend
./.venv/bin/python scripts/e2e.py --start-server     # 期望 "All checks passed."
```

**改代码前必知**：

- CLI 必须是 `/Users/xiangyu/Doubao/skills/hypit-repo/hypit`（checkout launcher），不是全局 npm 的。
- 改 `HYPIT_BIN` 之后要 `hypit runtime down`，否则老 Worker 还在用旧包树。
- `app/hypit_cli.py` 顶部 docstring 是许可红线，改这个文件前先读。
- 多实例 / 水平扩容会直接破坏 job 队列与状态文件，需要先重构到外部队列。
- 付费生成未经确认不要跑：先 `POST /api/v1/plans` 看 `providerRequestCount`，再 `GET /api/v1/pricing`。

---

## 7. AIM 集成（2026-09-16 追加）

> 上一节写的是「后端服务本身」。这一节是它被接进 AIM 出片链路后的状态与新增结论。
> 模板/提交契约的完整版在 **`docs/TEMPLATE-CONTRACT.md`**，那边是权威。

### 7.1 状态：三比例多产物已端到端打通并出片

作为 AIM 的**第四个 provider**（蝉镜 / 闪剪 / HeyGen 之后）接入：

- `apps/web/src/lib/hypit.ts`（客户端）、`hypit-ratio.ts`（三比例分派）、
  `hypit-template.ts`（`{{var}}`）、`hypit-templates.ts`（模板注册表 + Run Source 生成）。
- `digital-human-provider.ts#submitHypitVideo`：三种来源互斥
  `hypitTemplateName` / `hypitSourcePath` / `hypitSource`，给两种直接报错。
- 开关 `HYPIT_ENABLED`（默认关）+ 影子模式 `HYPIT_SHADOW_MODE`（产物落 `hypit-shadow/`）。

**验证**：`scripts/prove-template-flow.py` 一次提交产出三个真实 MP4
（`final-916` 132KB / `final-169` 126KB / `final-11` 96KB，`ftyp` 校验通过）。
AIM 侧 `pnpm typecheck` 通过、`pnpm test:unit` 594 文件 / 4139 项全绿、ESLint 0 error。

### 7.2 新增踩坑：提交必须是两步（`build` 只吃 Run Source）

`hypit build` 只能吃 Run Source，而一次 API 调用只写一个文件：

```
1) POST /api/v1/checks  { content: Author Source .svml }  → 落盘 + 校验，回 source 文件名
2) POST /api/v1/builds  { content: 生成的 .svrun }        → <author source="./上一步文件名"/>
```

第 1 步借 `check` 的**落盘副作用**上传（它名义上只校验不执行），顺带在渲染前拦住变量错误。

已证伪，别再试：

| 做法 | 结果 |
| --- | --- |
| 直接 build 一个 `.svml`（哪怕写了 `<target>`） | `build requires a self-described Run Source` |
| `.svrun` 内联 `<author><svml>…</svml></author>` | `<author> must be empty` |
| 把 recipes 内联成 markup 的 `<sheet>` | markup 不接受 `<sheet>`，整个源解析失败 |

还有：**Author Source 里不能有 `<target>`** →
`MARKUP_UNKNOWN_SURFACE: No imported module declares <target>`。

### 7.3 新增踩坑：素材路径必须相对，基准是工作区根

内联源落到**工作区根**（不是模板目录），所以模板里写 `./templates/<name>/…`。
绝对路径不行——`.svs` 的 `<import source>` 只接受相对路径或 npm 包名，绝对路径会被当成
npm 包 spec。

因此 **Dockerfile 里模板必须拷到 `/opt/hypit/templates`**（工作区根 = `HYPIT_CWD`），
拷到 `/app/templates` 会让所有模板提交找不到素材。本地（工作区 = 服务根）用同一套相对路径。

### 7.4 遗留

- `generic-card` 是**占位模板**（卡片图 + 背景音，无文字层）。业务模板（中汝达供暖 /
  芳姐 IP）内容未给，给了才能加 `{{title}}` 等文案变量。
- 需要「每次不同素材」时再评估 `POST /api/v1/assets`（含 SSRF 白名单），当前未实现。
- `pnpm arch:size` 失败（`env.ts` / `digital-human-provider.ts` / `hypit.ts` 超长）——
  **本分支既有问题**，本轮改动前已超限，建议单独开重构包。
