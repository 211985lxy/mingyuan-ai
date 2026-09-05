# 创作者数据总线（WP-C）打通实施记录 · 2026-09-05

> 状态：**✅ WP-C P0 全链路打通并冒烟通过**（数据雷达 → 飞书 5 表 → AIM creator-metrics 真实数据）
> 接续《2026-09-03-creator-metrics-feishu-data-bus-plan.md》第 8 节 P0。

## 最终结果（冒烟证据）

`fetchCreatorMetrics` 读真实飞书总线返回 `status: ok`：

- **posts: 27 条**（抖音，账号「IP明远」）
- 周期聚合（2026-01-01 至今）：**总播放 54,807｜互动 1,764**
- 平台合计：播放 54,807｜点赞 1,126｜评论 84｜分享 127｜收藏 427
- `lastSyncedAt` 正常（同步日志V2 读取成功）、`warnings: []`
- 字段契约：平台明细V2 的 20 个字段（视频平台/平台作品键/视频标题/总流量/点赞量/视频发布日期/完播率/3s跳出率/封标点击率等）与 `creator-metrics.ts` 映射**逐一对上**，含 P0 计划预期外的质量指标。

## 实施链路（全部实测）

| 环节 | 结果 |
| --- | --- |
| 数据雷达（127.0.0.1:8811）配置 | ✅ 飞书同步 OAuth 配置完成；抖音账号授权完成（账号「IP明远」） |
| 首次采集+同步 | ✅ 同步记录 2 次 SUCCESS（17:59 全量 42 成功/27 作品；18:07 增量 27） |
| 数据总线 Base（用户本人飞书空间） | `https://ncny6abson0d.feishu.cn/base/NjwnbbqR4ar5uZsxgXXcsF0UnLe` |
| 表清单 | 平台明细V2 `tbl27eKLAVKDLapi`(27) / 作品总表V2 `tblDom0lnfkBfqSN`(27) / 作品增量表(27) / 作品图表表(27) / 同步日志V2 `tbl7TDY4gVCdjxjF`(2) / 数据表(0,默认) |
| 共享给 AIM 应用 | ✅ member-add appid=cli_aa839aa942b89bef perm=edit |
| bot 读取 | ✅ `+record-list --as bot` 读平台明细V2 成功 |
| AIM env | ✅ `.env.local` 增 `LARK_CREATOR_METRICS_BASE_TOKEN=NjwnbbqR4ar5uZsxgXXcsF0UnLe` / `DETAIL_TABLE_ID=tbl27eKLAVKDLapi` / `SYNC_LOG_TABLE_ID=tbl7TDY4gVCdjxjF` |
| dev server | ✅ 已重启加载新 env（后台，日志 /tmp/aim-dev-3000.log） |
| lib 冒烟 | ✅ fetchCreatorMetrics → ok（上述数据） |

## 用户最终验证入口

打开 AIM → 项目周报复盘区，应出现「**创作者平台表现**」真实数据卡（27 条作品、播放/互动聚合），全程零人工回填——这正是 WP-C 的成功判据。

## 运维提示（后续同步）

- 数据保持新鲜：在数据雷达点「开始全面同步」（采集+自动推飞书）；AIM 侧按需拉取+15 分钟缓存，无需重启。
- 若数据雷达重装/换 Base：仅需更新 `.env.local` 三个 `LARK_CREATOR_METRICS_*` + 把新 base 共享给 AIM 应用。
- 「数据表」（0 条）是 base 默认空表，与总线无关，忽略。

## 并行另一条（方案 A，独立）

抖音绑定/data-platform 链路（`LARK_PLATFORM_*` 账号总表，TikHub 对标数据）已另行打通（见 git 历史与本文件早期版本）；自有账号官方 API 接入待并行工作流落地。

## 背景（冒烟结论，已解决）

- 该 Base 仅含「账号总表」，属抖音绑定/data-platform 功能；`data-platform/summary` 账号字段映射与表内 23 个真实字段完全吻合。
- 初始状态：表 0 条记录；AIM 应用 `cli_aa839aa942b89bef` 报 `app_scope_not_applied`（缺 `base:record:read`），且写入默认走 bot、失败被 catch 吞掉 → 绑定成功但表仍空。
- 注意区分：本表是 **抖音绑定/data-platform** 链路；WP-C 创作者数据总线（`LARK_CREATOR_METRICS_*`）是「明动数据雷达」同步自动建的另一套 5 表，两者互不相干。

## 验证命令速查（只读）

| 检查 | 命令 |
| --- | --- |
| 表结构/字段 | `lark-cli base +field-list --base-token $B --table-id $T --as user` |
| bot 读取 | `lark-cli base +record-list --base-token $B --table-id $T --as bot --limit 10` |
| 账号数据样例 | `lark-cli base +record-list --base-token $B --table-id $T --as user --limit 8` |
