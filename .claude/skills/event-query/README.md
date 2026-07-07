# event-query

Claude Code Skill，通过自然语言查询 ClickHouse 埋点数据。

## 功能

- 自然语言转 ClickHouse SQL，自动查询 `roi_ods.pwa_event_point_log` 表
- 内置完整事件码映射（11xxx/21xxx/31xxx/40xxx/80xxx/91xxx）
- 内置渠道枚举（FB/TK/KWAI/GOOGLE/MG_SKY_ADS）
- 跨环境全链路转化漏斗分析（FB广告 → Chrome → PWA安装）
- 结果自动格式化为 Markdown 表格

## 安装

将本目录复制到 `~/.claude/skills/event-query/`：

```bash
cp -r event-query ~/.claude/skills/
```

## 配置

编辑 `config.local.md`，填入你的 API 凭证：

```yaml
---
api_url: https://fe-toolkit.qiliangjia.org/roibest/query
authorization: Bearer <your-token>
x_access_key: <your-access-key>
---
```

Token 过期后更新 `authorization` 字段即可。

## 目录结构

```
event-query/
├── README.md              # 本文件
├── SKILL.md               # Skill 主文件（触发描述 + 工作流程）
├── CHANGELOG.md           # 版本变更记录
├── config.local.md        # API 凭证配置（不要提交到公开仓库）
├── scripts/
│   ├── query.sh           # 查询脚本（读配置 → 发请求）
│   └── format_result.py   # 结果格式化为 Markdown 表格
└── references/
    ├── pwa_event_point_log.md  # 表完整 schema（41 个字段）
    └── business_terms.md       # 事件码映射、业务术语、示例 SQL
```

## 使用示例

安装后直接对 Claude 说：

- "查一下最近 7 天的安装率"
- "渠道 4 最近一个月的转化漏斗"
- "按包名看哪个安装量最高"
- "查一下 project_id 9758092882 的数据"
- "边玩边下场景最近的订阅率怎么样"

## 依赖

- bash, curl, python3（系统自带即可）
- 无需额外安装任何包

## 注意事项

- `config.local.md` 包含敏感凭证，请勿提交到公开仓库
- 时间字段 `ts` 为 UTC 时间戳，查询自动处理 UTC+8 转换
- 空字符串过滤使用 `length(field) > 0` 而非 `field != ''`
