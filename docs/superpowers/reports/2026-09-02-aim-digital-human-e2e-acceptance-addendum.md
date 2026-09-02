# AIM 数字人验收补录：隔离 E2E 环境落地与套件跑绿

日期：2026-09-02
实现分支：`codex/aim-digital-human-implementation`（基线提交 `b740d0f6`）

## 1. 本次完成项

### 1.1 隔离 E2E 环境（原报告 §3 阻断项之一，已解除）

- 本机 Docker 启动隔离 `mysql:8.0`（端口 3307，库 `aim_e2e_test`）与 `redis:7`（端口 6380）。
- `pnpm test:e2e:prepare` 通过：baseline + 88 个迁移全部应用（含
  `20260819120000_restore_digital_human_video`、`20260831120000_digital_human_project_lineage`），
  schema contract 与数字人四表（VideoTask / VideoProductionPlan / VideoPackagingTemplate / Avatar）校验通过。
- 运行方式：`TEST_DATABASE_URL=mysql://…/aim_e2e_test TEST_REDIS_URL=redis://localhost:6380 pnpm test:e2e`。

### 1.2 E2E 套件修复（原报告未覆盖的真实状态）

原报告记录 E2E「阻断于缺少 TEST_DATABASE_URL」，实际该套件此前从未完整执行过。
配置环境后首轮运行 40/235 用例失败，根因全部为**测试夹具落后于新契约**，逐项修复：

| 文件 | 失败 | 根因与修复 |
| --- | --- | --- |
| webhook.test.ts | 13 | 新路由 fail-closed 要求 `SHANJIAN_WEBHOOK_SECRET` 与 `x-webhook-secret` 头；回调后需向供应商复核。补 mock `getTaskInfo`/`generateRawVideo` 并按用例提供复核结果 |
| video-tasks.test.ts | 11 | 新契约要求 `projectId`，且 avatar 必须与任务同项目；供应商失败映射 502。补 ClientProject 夹具与 projectId |
| avatars.test.ts | 9 | 新增必填 `cloneType`/`projectId`、授权视频须为已确认的受管 OSS URL；并发槽默认为 1 会 429。在 `vi.hoisted` 配置假 OSS（仅本地签名）与 `SHANJIAN_MAX_CONCURRENT=10` |
| poll-tasks.test.ts | 5 | 轮询按行内 `provider` 列分发（默认蝉镜），夹具补 `provider: "shanjian"`；恢复通道为全局 cron，beforeEach 改为全表清理保证确定性 |
| assets.test.ts | 1 | `document` 已是合法 assetType，改用真正的非法值 |
| branding-settings.test.ts | 1 | avatars 用例向 SystemSetting 写入品牌名且不清理，跨文件污染。移除无关的品牌写入 |

附带修复两处测试工程质量问题：断言失败后夹具状态未恢复（try/finally）；
`@e2e.com` 测试账户不在 `cleanDatabase` 清理范围（套件级 DB reset 兜底，文件内数据靠各自清理）。

### 1.3 新增蝉镜默认链路 live-fire E2E（原报告盲区）

`__tests__/e2e/chanjing-live-fire.test.ts`（10 用例）：进程内启动假蝉镜 Open API，
**不 mock 供应商客户端**，让真实 HTTP 客户端走完整网络路径，覆盖：

- access_token 签发与缓存；10400 过期后恰好一次重鉴权重试。
- `create_video` 合规载荷：person 布局、tts 文案、水印开关、回调地址、1080×1920。
- 状态映射：30→succeed、41→failed（含错误消息）。
- 蝉镜回调路由：回调后供应商复核（不信任回调内容）、成功结算（OSS 未配置走降级转存并落 `deliveryStatus=degraded`）、失败落账、Redis 去重、孤儿 404。
- 数字人克隆回调：置 ready、绑定声音资产、自动补发演示视频（真实打到假服务器的 create_video）。
- 回调鉴权 fail-closed（见 §2.1）。

成品素材 URL 使用公网域名 + OSS 未配置的降级路径，全程无外部网络请求。

### 1.4 修复蝉镜回调鉴权绕过（安全）

`src/app/api/webhook/chanjing/route.ts` 的 `authorizeChanjingWebhook` 原实现：
密钥已配置但请求**未携带** `x-webhook-secret` 时直接放行——省略请求头即可绕过校验
（闪剪路由为 fail-closed，两供应商行为不一致）。已改为缺失即拒绝，与闪剪对齐，
并由 live-fire 用例覆盖（缺失头 401 / 错误头 401 / 正确头 200）。

## 2. 验证结果

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` / `typecheck:tests` | 通过 |
| `pnpm lint`（改动文件） | 0 errors（2 条既有行数 warning） |
| `pnpm test:unit` | 2902 通过、2 跳过（与基线一致，安全修复无回归） |
| `pnpm test:e2e` | 28 文件 / **245 用例全部通过**（含新增 live-fire 10 例） |

## 3. 剩余阻断（与原报告一致，仍需外部输入）

1. 非生产蝉镜凭证（CHANJING_APP_ID / SECRET_KEY）与隔离回调地址——四种时长/画幅样本未跑。
2. 管理员闪剪备用凭证——“原任务不变、显式确认才新建备用任务”的真实验证未跑。
3. 20 任务灰度矩阵（≥19/20、无重复订单/结算、30 分钟内 95% 完成、质量评分 ≥4/5）未跑。
4. 两名内部员工 × 3 工作日灰度观察未开始。

结论：**隔离环境内可复现的全链路验收已全部转绿；距“可宣称上线”仍差真实供应商凭证与灰度矩阵。**

报告不含凭证或个人数据。E2E 容器（aim-e2e-mysql:3307 / aim-e2e-redis:6380）为本机隔离实例，随时可停删。
