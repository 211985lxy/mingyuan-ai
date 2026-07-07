# Changelog

## 2026-03-17

- 初始版本
- 支持 `roi_ods.pwa_event_point_log` 表查询
- 查询脚本 `scripts/query.sh` + 格式化脚本 `scripts/format_result.py`
- 完整事件码映射：11xxx(FB)、21xxx(Chrome)、31xxx(iOS)、40xxx(异常)、80xxx(Navbar)、91xxx(边玩边下)
- 渠道枚举：FB(4)、TK(5)、KWAI(9)、GOOGLE(10)、MG_SKY_ADS(56)
- 跨环境全链路转化漏斗作为首要示例 SQL
- 11 个示例 SQL 覆盖常见查询场景
