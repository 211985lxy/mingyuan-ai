# WP-1.1 效果数据自动回流

> 状态：实施中 · 日期：2026-09-12 · 分支：`feat/wp11-outcome-autofetch`
> 上游：《明动AIM-AI原生分批升级计划-2026-09-12》批次 1 / WP-1.1
> 红线：只写 ContentOutcome 内容信号（播放/赞/评/藏/转）；商业结果与判断码不自动猜测；不新建第二套拉取通道。

## 1. 改了什么

- 抖音已发布必须能解析出 aweme_id（长链 / 纯数字 ID / `v.douyin.com` 短链）。其它平台仍只需非空作品链接。
- 新服务 `outcome-autofetch`：按账号拉 `fetchDouyinRecentVideos`，用 aweme_id 对上 generation，按 7/14/30 天窗口 upsert 内容信号。
- 采集窗口：发布时间已过即写 7 日窗口（对齐计划 T+1）；满 14/30 天改写对应行，不把后期快照塞回 7 日窗口。
- 新 cron `/api/cron/outcome-autofetch`（每天 03:00，赶在 outcome-flywheel 04:00 评估之前）。
- 探针 `outcome-autofetch`：开放平台凭证未配 → unconfigured；绑定过期 → degraded。
- systemd 单元对已入库；生产 timer 已于 2026-09-13 安装。
- 存量回填脚本默认只打印解不出 ID 的清单，不改库。

## 2. 不做

- 不写线索/预约/成交/判断码。
- 不猜对不上的作品。
- 不把 14/30 天快照回填进 7 天窗口。
- 不改 K8s；发布提醒 / L0 / Sentry 仍默认关。

## 3. 验收（代码层）

- 单测：`outcome-autofetch` / cron / 状态机抖音作品键 / 短链 normalize / 探针名。
- `pnpm --filter web test:unit` 相关文件 + `typecheck` + `arch:size`。
- 放量级验收（T+1 自动出数、人工回填 ↓80%）要等生产打开 timer 后另记。
