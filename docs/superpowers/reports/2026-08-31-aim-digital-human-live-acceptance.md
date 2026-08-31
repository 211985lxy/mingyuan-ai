# AIM 数字人口播链路验收记录

日期：2026-08-31  
实现分支：`codex/aim-digital-human-implementation`

## 1. 本次交付范围

- 默认供应商：蝉镜（Chanjing）。
- 管理员人工备用：闪剪（Shanjian）；只有显式确认后才创建备用任务。
- 任务归属：用户、项目、AIM 生成记录、数字人和不可变稿件快照均持久化绑定。
- 可靠性：幂等键、供应商隔离并发槽、回调后供应商查询复核、轮询恢复、僵尸任务回收、AIM 对象存储转存和仅转存重试。
- 合规：服务端维护授权文本，授权视频必须通过 AIM 管理的上传预约完成后才能确认。

明确不在本期：LatentSync、自动 4K 增强、自动供应商切换、自动发布、客户计费和完整 SaaS 化。

## 2. 代码级门禁

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm typecheck` | 通过 | TypeScript 无错误 |
| `pnpm typecheck:tests` | 通过 | 测试类型无错误 |
| `pnpm test:unit` | 通过 | 426 个测试文件通过，1 个跳过；2902 个测试通过，2 个跳过 |
| `pnpm lint` | 通过 | 0 errors；仓库已有 528 条 warnings |
| `pnpm arch:check` | 通过 | AIM 架构护栏通过 |
| `pnpm arch:size` | 通过 | 207 个长函数，恢复后基线同步为 207；文件/路由上限未放宽 |
| `pnpm arch:retired` | 通过 | `digital-human-restored`，ASR 保留 |
| `pnpm arch:domains` | 通过 | 路由上限 250 行，6 条既有 legacy waiver |
| `pnpm db:bounds` | 通过 | `prisma-query-bounds-ok` |
| `pnpm api:contracts` | 通过 | 259 条路由 |
| `pnpm schema:migration-integrity` | 通过 | baseline=41，migrations=88 |
| `pnpm prisma validate` | 通过 | Prisma schema valid |
| `pnpm exec next build --webpack` | 通过 | 生产编译完成，静态页面 165/165 |

Turbopack 构建的唯一失败原因是隔离 worktree 的 `node_modules` 符号链接指向项目根外部，Next 16 将其拒绝；Webpack 生产构建已完成同一代码编译验证，未发现代码级构建错误。

本次将源码长函数基线从 193 调整为 207，是恢复完整数字人任务模块后的实测基线记录；后续应继续拆分这些恢复模块，再收紧基线，不应把该基线视为质量目标。

## 3. E2E 与真实供应商验收

当前工作区未提供隔离测试环境：`TEST_DATABASE_URL` 和 `TEST_REDIS_URL` 均未配置。

- `pnpm test:e2e:prepare`：阻断，原因是 `TEST_DATABASE_URL is required`。
- `pnpm test:e2e`：阻断于全局初始化，同样缺少 `TEST_DATABASE_URL`；未连接或修改 3306 生产库。
- 蝉镜/闪剪真实供应商样本：未执行，当前没有获批的非生产供应商凭证和隔离回调环境。
- 20 任务验收矩阵：未执行，因此没有伪造成功率、时延、重复订单、转存或人工质量评分。

## 4. 发布决定

结论：**代码已具备进入隔离环境内部灰度测试的条件，但尚不能宣称已完成真实业务上线。**

上线前必须补齐：

1. 隔离 MySQL/MariaDB、Redis 和 E2E 环境变量，完成 avatar、video task、callback、polling、settlement E2E。
2. 配置非生产蝉镜凭证、授权文本、AIM 对象存储上传预约和回调地址，完成四种样本（15 秒/60 秒/180 秒、9:16/16:9）。
3. 配置管理员闪剪备用凭证并验证“原任务不变、显式确认才新建备用任务”。
4. 运行 20 个蝉镜内部任务，达到计划阈值：至少 19/20 成功、无重复订单/重复结算、成功结果 100% 持久化、最长 3 分钟任务 95% 在 30 分钟内完成，身份/口型/画面稳定性均至少 4/5。
5. 通过两名内部员工连续三个工作日的灰度观察后，再决定是否扩大访问范围；客户访问、计费和自动发布保持关闭。

报告不包含凭证、客户原文、个人信息或临时供应商 URL。
