# A 系列放量报告草稿（2026-09-12）

> 这是草稿，不是放量完成证明。CI/单测绿只是及格线。下面「证据」栏空着的，上线后补。

## 开关（默认全开，要关就改 env）

| 变量 | 作用 | 当前默认 |
|---|---|---|
| `AIM_JOB_DISABLED` | 逗号分隔任务 id，对应 cron 空转 | 空（全开） |
| `AIM_ACCOUNT_WORK_INIT_ENABLED` | 账号历史初始化 | 未设视为开 |
| `AIM_PUBLISH_PREDICTION_ENABLED` | 发布预测 | 未设视为开 |
| `AIM_KNOWLEDGE_GRAPH_HOP_ENABLED` | 检索图扩展一跳 | 未设视为开 |
| `AIM_LOOP_NOTIFICATIONS_ENABLED` | 预测飞书卡片依赖这条 | 沿用现网 |

库内覆盖：自动化台账开关写在 `SystemSetting`，键名 `automation.job.<id>.enabled`。

## 探针

轻抖逐字稿继续走现成 `qingdou-video-extract`，本包没加新探针。放量时看 integration-probe 是否 healthy，不要只看页面。

## 各 WP 放量证据（待填）

| WP | 要看到什么 | 证据 |
|---|---|---|
| A2 V1 | 非技术用户能说出每天自动做哪几件事、有没有告警 | |
| A2 V2 | 管理员立即执行有审计；五分钟内连点被挡；开关空转不停 timer | |
| A6 L0 | 真实项目导出一份 JSON+MD，无密钥字段 | |
| A1 | 绑定后 24h 投影表有作品；选题上下文有历史段；近 90 天逐字稿 100%；重复提取 0 | |
| A5 | 基线报告归档；原子覆盖 ≥80%；图谱提升数字 | 夹具基线已归档；生产对比未跑 |
| A3 | 4 周每条已发布内容有预测和对账 | |
| A6 L1 | 隔离环境：部署、探针全绿、备份可恢复 | 未启动（等客户信号） |
| A4 | 5 人纸面访谈通过线 | 未访谈 |
| DEC-1 | 本页书面结论已落 | 维持项目隔离 |

## Schema

迁移目录：`apps/web/prisma/migrations/20260912100000_add_account_work_prediction_atoms/`。上线前要在目标库执行，并 `prisma generate`。未 generate 时运行时代码会走空委托，功能静默不写库——看起来像没坏，其实没存上。
