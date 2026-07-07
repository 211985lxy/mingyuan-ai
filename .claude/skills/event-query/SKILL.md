---
name: event-query
version: 2026-03-17
description: 埋点数据查询工具，连接 ClickHouse 数据库查询 PWA 事件埋点数据（roi_ods.pwa_event_point_log 表）。当用户提到查询埋点数据、事件统计、安装率、访问量、event_code 统计、按日期/渠道/包名/投放人分组查数据、查看某个 project 的埋点情况、或者任何涉及 pwa_event_point_log 表的查询时，使用此 skill。即使用户只是说"帮我查一下最近几天的数据"或"看看安装率"，也应该触发。
---

# 埋点数据查询

通过 ClickHouse API 查询 PWA 埋点数据，将用户的自然语言需求转化为 SQL 并执行。

## 工作流程

1. 理解用户查询意图
2. 参考 `references/business_terms.md` 中的示例 SQL 和业务术语，生成合适的 SQL
3. 用 `scripts/query.sh` 执行查询
4. 用 `scripts/format_result.py` 格式化结果为 Markdown 表格
5. 展示结果，并附上简要分析

## 快速上手

### 执行查询

```bash
# 一步到位：查询 + 格式化
bash <skill-path>/scripts/query.sh "<SQL>" | python3 <skill-path>/scripts/format_result.py
```

`<skill-path>` 即本 SKILL.md 所在目录。配置文件 `config.local.md` 在同目录下，包含 API 地址和认证信息。

### SQL 生成要点

- 表：`roi_ods.pwa_event_point_log`
- 时间字段 `ts` 是 UTC 时间戳，转北京时间：`toDate(fromUnixTimestamp(ts) + INTERVAL 8 HOUR)`
- 时间过滤：`ts >= toUnixTimestamp(today() - INTERVAL N DAY + INTERVAL 8 HOUR)`
- 默认查最近 7 天，除非用户指定
- 核心事件码分六大类：11xxx（FB广告内）、21xxx（Chrome正常场景，最常用）、31xxx（iOS）、40xxx（异常）、80xxx（Navbar）、91xxx（边玩边下）
- 最常用漏斗（跨环境）：11001（FB访问）→ 21001（Chrome访问）→ 21003（install点击）
- 安装率：`round(countIf(event_code = 21003) / nullIf(countIf(event_code = 21001), 0) * 100, 2)`
- Chrome访问率：`round(countIf(event_code = 21001) / nullIf(countIf(event_code = 11001), 0) * 100, 2)`
- 默认使用 21xxx（Chrome 环境）事件码，除非用户指定 FB 或 iOS 环境
- 渠道枚举：4=FB, 5=TK(TikTok), 9=KWAI(快手), 10=GOOGLE, 56=MG_SKY_ADS（这是完整枚举）
- 注意：空字符串过滤用 `length(field) > 0` 而非 `field != ''`（避免转义问题）

## Reference 文件

当需要更详细的信息时，读取以下文件：

| 文件 | 内容 | 何时读取 |
|------|------|----------|
| `references/pwa_event_point_log.md` | 表完整 schema（全部 41 个字段）、时间处理、URL参数提取 | 需要用到非常用字段时 |
| `references/business_terms.md` | 事件码含义、常用指标计算公式、维度说明、9 个示例 SQL | 生成 SQL 前参考，不确定时必读 |

## 结果展示

- 格式化为 Markdown 表格
- 超过 50 行时显示前 50 行并提示总数
- 对结果做简要分析（趋势、异常值等）
- 百分比字段后加 % 显示
