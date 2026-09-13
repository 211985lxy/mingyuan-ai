# 账号作品数据源切换：TikHub 主 + 红狐备（WP-A1 数据通道，2026-09-13）

## 为什么切

抖音开放平台的「授权账号作品列表」能力**已下线**，网站应用侧也无对应数据能力可申请。生产实测证据：

| 接口 | 结果 |
| --- | --- |
| `GET /oauth/userinfo/` | ✅ 正常返回（token 有效，scope=`user_info`） |
| `GET /api/douyin/v1/video/list/` | ❌ `Unsupported path(Janus)`（该路径不存在，属代码内的历史错误） |
| `GET /api/douyin/v1/video/video_list/` | ❌ `28001056 该能力API已下线，不再支持调用` |

即：原 WP-1.1 / WP-A1 默认的官方数据源**不可用**，且不是"补权限"能解决的。

## 替换方案

改为双源公开数据通道，**两者返回同一 `NormalizedVideo` 结构**，因此切换只发生在数据源层：

| 通道 | 端点 | 定位方式 | 生产实绩 |
| --- | --- | --- | --- |
| 主：TikHub | `/api/v1/douyin/app/v3/fetch_user_post_videos` | `sec_user_id` | 竞品采集 **33 次成功** |
| 备：红狐 | `/story/api/dyData/queryWorkList` | `authorUrl`(+`secUserId`) | 竞品采集 **9 次成功** |

红狐当前套餐为「优质库」名单制——实测自有账号「明远AI商业洞察」资料可取但 `works` 为空、`queryWorkList` 返回 `3203 优质库暂未收录该内容`（连"疯狂小杨哥"同样未收录）。故红狐只作备源/交叉校验，通用覆盖靠 TikHub。

## 关键设计决定

1. **全部通道失败时抛错，不返回空数组**。历史上 API 挂掉但 cron 报 `okCount:1, failedCount:0` 的"假绿"正是本次要治的问题；现在错误进 `BindingSyncSummary.error`，并新增 `source` / `fallbackUsed` / `fallbackReason` 字段。
2. **sec_user_id 一次性采集**：`POST /api/integrations/douyin/accounts/:id/profile-url` 收主页链接 → `DouyinAdapter.resolveUrl()`（TikHub `get_sec_user_id`，含短链与本地降级）→ 落 `DouyinAccountBinding.secUserId`。之后每日同步全自动。
3. **cron 环境禁用浏览器兜底**：`new DouyinAdapter({ localFallback: false })`。
4. **新增探针 `account-works-channel`（critical）**：无通道配置 → failed；有绑定但全都缺 `sec_user_id` → degraded（作品数据永远取不到的情形必须可见）。
5. **红狐链接域名白名单**：只接受 `douyin.com` / `iesdouyin.com`，不把任意 URL 交给第三方解析接口。

## 未改动

`AccountWorkAsset` 投影、历史摘要、逐字稿提取计划、accountHistory 上下文注入、A3 预测链路**一行未改**——它们只消费归一化后的作品数据，与数据源解耦。

## 运维待办

- 存量绑定需补一次主页链接（`account-works-channel` 探针会以 degraded 提示）。
- 红狐若要全量覆盖，需邮件咨询开通「广域库」（redfoxdata@proton.me）——非阻塞项。
- 第三方通道为公开数据、按量计费，纳入 `quota_blocked` 探针监控。
