# 运维生命周期演练（正本阶段 5 / feat/ops-lifecycle-drills）

> 目的：Trace 保留期、敏感 Snapshot 清理、账号删除、备份恢复可复盘。  
> 原则：先影子/只读核对，再在维护窗口执行破坏性步骤。

## 1. Trace / Snapshot 保留期

| 步骤 | 动作 | 记录 |
|---|---|---|
| 1.1 | 确认 `AimRunTrace` / Snapshot 表保留策略与现网 TTL | 日期：____ 执行人：____ |
| 1.2 | 抽样 3 条过期候选，确认无未结案人工审核依赖 | |
| 1.3 | 影子清理 dry-run（只列 ID，不删） | 输出路径：____ |
| 1.4 | 正式清理后核对 count 下降与健康检查 | |

回滚：从最近一次 `backup:database` 恢复受影响表。

## 2. 敏感 Snapshot 清理

| 步骤 | 动作 | 记录 |
|---|---|---|
| 2.1 | 按项目/用户标记含客户原文的 Snapshot | |
| 2.2 | 脱敏或删除后，确认 API 不可再读明文 | |
| 2.3 | 确认评估 fixtures 未引用已删 Snapshot | |

## 3. 账号删除

| 步骤 | 动作 | 记录 |
|---|---|---|
| 3.1 | 测试账号发起删除（或模拟） | |
| 3.2 | 核对 ChannelBinding / AimMemory / Generation 归属清理 | |
| 3.3 | 确认其他租户数据未误删 | |

## 4. 备份恢复演练

```bash
pnpm --dir apps/web run backup:database
pnpm --dir apps/web run backup:verify
```

| 步骤 | 动作 | 记录 |
|---|---|---|
| 4.1 | 生成备份并校验 checksum | 备份文件：____ |
| 4.2 | 在隔离库恢复并跑 `schema:verify` + 冒烟登录 | |
| 4.3 | 记录 RTO/RPO 实测 | RTO：____ RPO：____ |

## 5. 门禁

- 正式灰度 `live` 前，本文件至少有一次完整填写（日期+执行人）。
- 缺备份恢复结果时，只能代码+影子验收，不得宣称生产闭环。
