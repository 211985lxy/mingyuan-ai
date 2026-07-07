# pwa_event_point_log 表完整 Schema

- 库表：`roi_ods.pwa_event_point_log`
- 用途：PWA 应用埋点事件日志，记录用户访问、安装、行为等事件

## 字段列表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UInt64 | 主键ID |
| project_id | String | 项目ID，标识不同的投放项目 |
| channel_id | Int32 | 渠道ID，标识流量来源渠道 |
| event_code | Int32 | 事件值，核心字段，标识具体事件类型 |
| package | String | 包名，PWA 应用包名 |
| version | Int32 | 版本号 |
| promoter | String | 投放人，负责该投放计划的人 |
| link_id | String | 链接ID |
| uuid | String | 用户唯一标识 |
| ip | String | 用户 IP 地址 |
| ua_browser | String | 浏览器名称 |
| ua_browser_ver | String | 浏览器版本 |
| ua_browser_major_ver | String | 浏览器主版本号 |
| ua_os | String | 操作系统 |
| ua_os_ver | String | 操作系统版本 |
| ua_device_brand | String | 设备品牌 |
| ua_device_model | String | 设备型号 |
| ua_app | String | App 信息 |
| ua_app_ver | String | App 版本 |
| report_url | String | 上报 URL，包含广告参数（ad_id, ad_name, adgroup 等） |
| language | String | 语言 |
| timezone | String | 时区 |
| invite_code | String | 邀请码 |
| promote_url_id | String | 推广链接ID，对应 promote_url 表的记录ID |
| local_time | String | 用户本地时间 |
| pvid | String | 页面访问ID |
| base64_params | String | Base64 编码的附加参数 |
| user_agent | String | 完整 User-Agent 字符串 |
| source | String | 数据来源 |
| extend | String | 扩展字段（JSON） |
| extend_id | Int64 | 扩展ID |
| x_requested_with | String | X-Requested-With 头 |
| cf_ip_country | String | Cloudflare 识别的国家代码 |
| cf_ray | String | Cloudflare Ray ID |
| data_mark | String | 数据标记，NORMAL 为正常数据 |
| ts_time | Nullable(DateTime('UTC')) | 时间戳时间 |
| ts | UInt32 | Unix 时间戳（UTC），主要时间过滤字段 |
| created_at | DateTime64(3, 'UTC') | 创建时间 |
| updated_at | DateTime64(3, 'UTC') | 更新时间 |
| deleted_at | Nullable(DateTime64(3, 'UTC')) | 删除时间 |
| msg_event_time | DateTime64(3, 'UTC') | 消息事件时间 |

## 时间字段使用说明

主要使用 `ts` 字段做时间过滤，它是 UTC 时间戳。

```sql
-- 转北京时间日期
toDate(fromUnixTimestamp(ts) + INTERVAL 8 HOUR) AS event_date

-- 最近 N 天（北京时间）
ts >= toUnixTimestamp(today() - INTERVAL N DAY + INTERVAL 8 HOUR)
AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)

-- 指定日期范围（北京时间）
ts >= toUnixTimestamp(toDateTime('2025-03-01 00:00:00') - INTERVAL 8 HOUR)
AND ts < toUnixTimestamp(toDateTime('2025-03-15 00:00:00') - INTERVAL 8 HOUR)
```

## report_url 参数提取

report_url 中常见的广告参数：

```sql
extractURLParameter(report_url, 'ad_id') AS ad_id
extractURLParameter(report_url, 'ad_name') AS ad_name
extractURLParameter(report_url, 'adgroup') AS adgroup
extractURLParameter(report_url, 'campaign') AS campaign
```
