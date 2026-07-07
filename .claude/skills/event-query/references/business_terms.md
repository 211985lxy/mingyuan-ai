# 业务术语与示例 SQL

## 事件码（event_code）完整映射

事件码分为五大类：

| 前缀 | 环境 | 说明 |
|------|------|------|
| 11xxx | FB广告环境内 | 在 Facebook 应用内浏览器中的行为 |
| 21xxx | Chrome 环境 | 正常场景，**查询最多的一类** |
| 31xxx | iOS 环境 | iOS Safari/非Safari 的行为 |
| 40xxx | 异常 | 异常状态码 |
| 80xxx | Navbar 导航栏 | 导航栏、推送通知、启动页等 UI 组件 |
| 91xxx | 边玩边下场景 | 边玩边下载的特殊场景，查询也较多 |

> 日常查询以 **21xxx（Chrome 正常场景）** 为主，除非用户明确说"边玩边下"或"fb内"。

### FB 广告环境内（11xxx）

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 11001 | ADV_LANDING_PAGE_BROWSE | 落地页访问数（fb内） |
| 11002 | ADV_INSTALL_CLICK | 安装install点击（fb内） |
| 11003 | ADV_BACK_INSTALL | 返回拦截跳转Chrome（fb内） |
| 11004 | ADV_AUTO_OPEN | 自动跳（fb内） |
| 11005 | ADV_SHOW_BACK_POPOVER | 返回弹窗显示（fb内） |
| 11006 | ADV_BACK_POPOVER_CLICK | 返回弹窗点击（fb内） |
| 11007 | EVENT_CODE_11007 | （未定义） |
| 11008 | ADV_COMPLAINT_BAR_CLICK | 点击举报当前开发者不当内容和行为 |
| 11009 | ADV_COMPLAINT_FORM_SUBMIT | 在举报页面点击提交 |
| 11010 | ADV_INSTALL_PIXEL_REPORT | Pixel 安装上报（fb内） |
| 11011 | ADV_PLAY_PAGE_ROUTER_BACK_REPORT | play页面返回拦截（fb内） |
| 11053 | ADV_INSTALL_USER_RE_VISIT | 已安装用户再次访问广告（fb内） |
| 11080 | ADV_PAGE_HIDE | 广告环境页面隐藏 |
| 11081 | ADV_PAGE_VISIBILITY | 广告环境页面显示 |

### Chrome 环境（21xxx）

#### 核心漏斗事件

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21001 | CHROME_LANDING_PAGE_BROWSE | 落地页访问量（Chrome内） |
| 21002 | CHROME_INSTALL_CLICK | rapid install点击（Chrome内） |
| 21003 | APP_INSTALL_CLICK | install 点击 |
| 21005 | APP_ACTIVATE | **app启动量**（核心转化指标） |
| 21008 | APP_INSTALL_LAYER_SHOW | 调起原生安装窗口（Chrome内） |
| 21009 | CHROME_INSTALL | 安装install点击总数（Chrome内） |
| 21023 | APP_INSTALL_READY | 原生安装事件准备好了 |

#### 安装交互细节

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21006 | CHROME_BACK_INSTALL | 返回拦截调起安装install（Chrome内） |
| 21011 | CHROME_INSTALL_NOW_CLICK | 点击 install now |
| 21012 | CHROME_FAKE_INSTALL_CLICK | 点击 fake-alert 上的 install |
| 21015 | CHROME_INSTALL_ERROR | rapid install 点击没成功调起 |
| 21016 | CHROME_INSTALL_NOW_ERROR | 点击 install now 没成功调起 |
| 21017 | CHROME_FAKE_INSTALL_ERROR | 点击 fake-alert install 没成功调起 |
| 21018 | APP_INSTALL_CANCEL | 取消安装 |
| 21070 | APP_INSTALL_POLLING_END | 轮询结束 |
| 21071 | APP_INSTALL_LAYER_SHOW_ERROR | 调起原生安装窗口失败 |
| 21072 | APP_INSTALL_POLLING_START | 轮询开始 |
| 21073 | CHROME_INSTALL_PIXEL_REPORT | Pixel 安装上报（Chrome内） |

#### 商店页 Play

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21004 | CHROME_PLAY_CLICK | 商店页 play 点击（Chrome内） |
| 21007 | CHROME_BACK_PLAY | 返回拦截调起 Play（Chrome内） |
| 21010 | CHROME_PLAY | 商店页 play 点击总数（Chrome内） |
| 21019 | CHROME_PLAY_ERROR | 商店页 play 启动失败 |
| 21022 | CHROME_PLAY_ACTIVATE | 手动点击 play → app 启动 |

#### 检测页面

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21013 | SCAN_BROWSE | 检测页面浏览 |
| 21014 | SCAN_OPEN_CLICK | 检测页面 open 点击 |
| 21020 | SCAN_OPEN_ERROR | 检测页面 open 启动失败 |
| 21021 | SCAN_OPEN_ACTIVATE | 点击 open → 成功启动 app |

#### 订阅通知

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21024 | CHROME_SUBSCRIBE_SHOW | Chrome 弹起订阅通知 |
| 21025 | CHROME_SUBSCRIBE_ALLOW | 允许订阅 |
| 21026 | CHROME_SUBSCRIBE_DEFAULT | 订阅授权无操作 |
| 21027 | CHROME_SUBSCRIBE_DENIED | 拒绝订阅 |
| 21028 | NOTIFICATION_SHOW | 推送通知显示 |
| 21029 | NOTIFICATION_CLICK | 推送通知点击 |

#### 返回弹窗

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21030 | CHROME_SHOW_BACK_POPOVER | 返回弹窗显示（Chrome内） |
| 21031 | CHROME_BACK_POPOVER_CLICK | 返回弹窗点击（Chrome内） |

#### 页面生命周期

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21032 | APP_UNLOAD | app 卸载 |
| 21034 | CHROME_ACTIVATE | 浏览器启动 |
| 21080 | CHROME_PAGE_HIDE | Chrome 环境页面隐藏 |
| 21081 | CHROME_PAGE_VISIBILITY | Chrome 环境页面显示 |

#### 分享相关

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21040 | SHARE_PAGE_ENTER | 广告平台进入分享页面 |
| 21041 | SHARE_PAGE_SHARE_BTN_CLICK | 广告平台点击分享按钮 |
| 21042 | SHARE_PAGE_SHARE_EMAIL_INPUT | 广告平台输入分享弹窗邮箱 |
| 21043 | SHARE_PAGE_SHARE_API_SUCCESS | 广告平台内成功调起分享API |
| 21044 | CHROME_SHARE_PAGE_ENTER | Chrome 进入分享页面 |
| 21045 | CHROME_SHARE_PAGE_SHARE_BTN_CLICK | Chrome 点击分享按钮 |
| 21046 | CHROME_SHARE_PAGE_SHARE_EMAIL_INPUT | Chrome 输入分享弹窗邮箱 |
| 21047 | CHROME_SHARE_PAGE_SHARE_API_SUCCESS | Chrome 内成功调起分享API |
| 21051 | COPY_SHARE_FISSION_SHOW | 复制分享裂变弹窗显示 |
| 21052 | COPY_SHARE_FISSION_CLICK | 复制分享裂变弹窗点击 |

#### 三星设备

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21048 | SAMSUNG_INSTALL_CLICK | 三星成功安装点击 |
| 21049 | SAMSUNG_INSTALL_FAIL | 三星失败安装点击 |
| 21050 | SAMSUNG_SUCCESS_TO_CHROME | 三星跳转 Chrome |

#### 举报

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21053 | CHROME_INSTALL_USER_RE_VISIT | 已安装用户再次访问广告（Chrome内） |
| 21054 | CHROME_COMPLAINT_BAR_CLICK | Chrome 点击举报 |
| 21055 | CHROME_COMPLAINT_FORM_SUBMIT | 举报页面点击提交 |
| 21068 | COMPLAINT_COMPONENT_SHOW | 举报组件显示 |
| 21069 | COMPLAINT_PAGE_SHOW | 举报页面显示 |

#### DeepClick

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21065 | DEEP_CLICK_IMPRESSION_SHOW_AD_ENV | 非Chrome环境 DeepClick 来源访问 |
| 21066 | DEEP_CLICK_IMPRESSION_SHOW_CHROME_ENV | Chrome环境 DeepClick 来源访问 |
| 21067 | DEEP_CLICK_INSTALL | DeepClick 来源安装 |

#### 抽奖

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21056 | ADV_LOTTERY_SHOW | 抽奖弹窗显示 |
| 21057 | ADV_LOTTERY_GO_CLICK | 点击go按钮 |
| 21058 | ADV_LOTTERY_INSTALL_CLICK | 点击安装按钮 |
| 21059 | CHROME_LOTTERY_SHOW | 抽奖弹窗显示（Chrome内） |
| 21060 | CHROME_LOTTERY_GO_CLICK | 点击go按钮（Chrome内） |
| 21061 | CHROME_LOTTERY_INSTALL_CLICK | 点击安装按钮（Chrome内） |
| 21062 | SAMSUNG_LOTTERY_SHOW | 三星抽奖弹窗显示 |
| 21063 | SAMSUNG_LOTTERY_GO_CLICK | 点击go按钮（三星） |
| 21064 | SAMSUNG_LOTTERY_INSTALL_CLICK | 点击安装按钮（三星） |

#### 路由返回

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21074 | CHROME_PLAY_PAGE_ROUTER_BACK_REPORT | play 页面返回拦截（Chrome内） |
| 21075 | SCAN_PAGE_ROUTER_BACK_REPORT | scan 页面返回拦截（Chrome内） |
| 21076 | PLAY_ROUTER_BACK_APP_ACTIVATE | play 页面点击返回 → app 启动 |
| 21077 | PLAY_ROUTER_BACK_APP_ACTIVATE_ERROR | play 页面点击返回 → app 启动失败 |
| 21078 | SCAN_ROUTER_BACK_APP_ACTIVATE | scan 页面点击返回 → app 启动 |
| 21079 | SCAN_ROUTER_BACK_APP_ACTIVATE_ERROR | scan 页面点击返回 → app 启动失败 |

#### 其他

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 21033 | EVENT_CODE_21033 | （未定义） |
| 21035 | NORMAL_LINK_CLICK | 普通链接点击 |
| 21036 | NORMAL_LINK_BROWSE | 普通链接浏览 |

### iOS 环境（31xxx）

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 31001 | IOS_SAFARI_PAGE_VIEW | iOS Safari 落地页访问 |
| 31002 | IOS_NOT_SAFARI_PAGE_VIEW | iOS 非Safari 落地页访问 |
| 31003 | ADD_TO_SCREEN_LAYER_OPEN | iOS 添加到屏幕层打开 |
| 31004 | ADD_TO_SCREEN_LAYER_CLOSE | iOS 添加到屏幕层关闭 |
| 31005 | EXTERNAL_BROWSER_LAYER_OPEN | iOS 外部浏览器层打开 |
| 31006 | EXTERNAL_BROWSER_LAYER_CLOSE | iOS 外部浏览器层关闭 |
| 31007 | BACK_LAYER_OPEN | iOS 返回层打开 |
| 31008 | BACK_LAYER_CLOSE | iOS 返回层关闭 |
| 31009 | BACK_LAYER_BTN_CLICK | iOS 返回层按钮点击 |
| 31010 | IOS_PAGE_VISIBILITY | iOS 页面可见性变化 |
| 31011 | IOS_PAGE_HIDE | iOS 页面隐藏 |
| 31012 | IOS_PWA_APP_ACTIVATE | iOS PWA index 启动（包网/自研） |
| 31013 | IOS_NOMORL_APP_DEACTIVATE | iOS 浏览器 index 启动（包网/自研） |

### 异常（40xxx）

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 40001 | NOT_FOUND_PACKAGE_ADDRESS | 包网地址未拿到 |

### Navbar 导航栏（80xxx）

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 80001 | NAVBAR_SHOW | 导航栏展示 |
| 80002 | NAVBAR_CLICK | 导航栏点击 |
| 80003 | NAVBAR_DRAWER_SHOW | 导航栏抽屉展示 |
| 80004 | NAVBAR_DRAWER_CLOSE | 导航栏抽屉关闭 |
| 80005 | NAVBAR_NOTIFICATION_SHOW | 导航栏推送通知展示 |
| 80006 | NAVBAR_NOTIFICATION_CLICK | 导航栏推送通知点击 |
| 80007 | NAVBAR_NOTIFICATION_CLOSE | 导航栏推送通知关闭 |
| 80008 | NAVBAR_AD_CONTENT_CLICK | 广告位点击 |
| 80010 | NAVBAR_APP_SPLASH_SHOW | 应用启动页展示 |
| 80011 | NAVBAR_APP_SPLASH_CLICK | 应用启动页点击 |
| 80012 | NAVBAR_APP_SPLASH_CLOSE | 应用启动页关闭 |

### 边玩边下场景（91xxx）

#### 核心漏斗

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91001 | ADV_LANDING_PAGE_BROWSE | 广告平台内-落地页访问 |
| 91053 | CHROME_LANDING_PAGE_BROWSE | Chrome 内访问 |
| 91002 | ADV_LANDING_PAGE_CLICK | 广告平台内-点击 play |
| 91068 | ADV_PLAY_NOW_CLICK | 广告平台内-Play Now 点击 |
| 91004 | ADV_AUTO_OPEN | 广告平台内-自动跳转 Chrome |
| 91005 | SUCCESS_OPEN_CHROME | 成功进入 Chrome |
| 91006 | CHROME_FIRST_CLICK | Chrome内-首次点击 |

#### PWA 安装流程

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91023 | PWA_INSTALL_READY | 原生安装事件准备好了 |
| 91008 | PWA_INSTALL_WINDOW_SHOW | 成功弹起原生安装弹窗 |
| 91003 | PWA_INSTALL_ACCEPTED | 安装 PWA 允许 |
| 91018 | PWA_INSTALL_DISMISSED | 安装 PWA 拒绝 |
| 91032 | PWA_UN_INSTALL | PWA 已卸载 |

#### 订阅

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91024 | CHROME_SUBSCRIBE_SHOW | Chrome内-弹起订阅 |
| 91025 | CHROME_SUBSCRIBE_ALLOW | Chrome内-允许订阅 |
| 91026 | CHROME_SUBSCRIBE_DENIED | Chrome内-拒绝订阅 |
| 91027 | CHROME_SUBSCRIBE_DEFAULT | Chrome内-订阅授权无操作 |
| 91038 | CHROME_SUBSCRIBE_ERROR | Chrome内-订阅失败 |

#### 引导安装弹窗

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91028 | CHROME_GUIDE_DOWNLOAD_SHOW | Chrome内-弹起引导安装弹窗 |
| 91039 | CHROME_GUIDE_DOWNLOAD_CLICK | Chrome内-点击引导安装弹窗 |
| 91045 | CHROME_GUIDE_DOWNLOAD_CANCEL | Chrome内-取消引导安装弹窗 |

#### VIP 邀请

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91029 | CHROME_VIP_INVITE_SHOW | Chrome内-弹起 VIP 邀请弹窗 |
| 91048 | CHROME_VIP_INVITE_CLICK | Chrome内-点击 VIP 邀请弹窗 |

#### PWA 启动浮层

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91030 | CHROME_PWA_LAUNCH_FLOAT_SHOW | Chrome内-弹起 PWA 启动浮层 |
| 91035 | CHROME_PWA_LAUNCH_FLOAT_CLICK / PWA_LAUNCH_FLOAT_CLICK | Chrome内-点击 PWA 启动浮层 / 点击引导启动 |

#### PWA 进入方式

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91033 | ENTER_PWA_INSTALL_FLOW | 通过安装流程进入 PWA |
| 91034 | ENTER_PWA_DESKTOP_FLOW | 通过桌面进入 PWA |
| 91037 | FULL_SCREEN_LAUNCH | 全屏进入 H5 |

#### 游戏入口与底部安装

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91040 | CHROME_GAME_ENTRANCE_MODAL_SHOW | 游戏 loading 弹框显示 |
| 91041 | CHROME_GAME_ENTRANCE_MODAL_CLICK | 游戏 loading 弹框点击 |
| 91042 | CHROME_BOTTOM_INSTALL_MODAL_SHOW | 底部安装弹框显示 |
| 91043 | CHROME_BOTTOM_INSTALL_MODAL_CLICK | 底部安装弹框点击 |

#### 短剧引导

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91051 | SHORT_DRAMA_PLAY_MODAL_SHOW | 短剧引导播放弹框显示 |
| 91052 | SHORT_DRAMA_PLAY_MODAL_CLICK | 短剧引导播放弹框点击 |

#### 悬浮球

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91060 | SHOW_DOWNLOAD_FLOAT_BTN_SHOW | 悬浮球展示 |
| 91055 | SHOW_DOWNLOAD_FLOAT_BTN_CLICK | 悬浮球点击 |
| 91056 | SHOW_DOWNLOAD_FLOAT_MODAL_SHOW | 悬浮球弹框展示 |
| 91057 | SHOW_DOWNLOAD_FLOAT_CTA_CLICK | 悬浮球弹框 CTA 点击 |
| 91058 | SHOW_DOWNLOAD_FLOAT_CANCEL | 悬浮球弹框取消 |

#### 返回拦截

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91059 | ROUTER_BACK | 返回拦截 |

#### 引导下载弹窗（全体验/全功能/继续later）

| event_code | 常量名 | 说明 |
|------------|--------|------|
| 91061 | FULL_EXPERIENCE_GUIDE_DOWNLOAD_SHOW | 全体验引导下载弹窗展示 |
| 91064 | FULL_EXPERIENCE_GUIDE_DOWNLOAD_CLICK | 全体验引导下载弹窗点击 |
| 91067 | FULL_EXPERIENCE_GUIDE_DOWNLOAD_CANCEL | 全体验引导下载弹窗取消 |
| 91062 | FULL_FEATURES_GUIDE_DOWNLOAD_SHOW | 全功能引导下载弹窗展示 |
| 91065 | FULL_FEATURES_GUIDE_DOWNLOAD_CLICK | 全功能引导下载弹窗点击 |
| 91068 | FULL_FEATURES_GUIDE_DOWNLOAD_CANCEL | 全功能引导下载弹窗取消 |
| 91063 | RESUME_LATER_GUIDE_DOWNLOAD_SHOW | 继续 later 引导下载弹窗展示 |
| 91066 | RESUME_LATER_GUIDE_DOWNLOAD_CLICK | 继续 later 引导下载弹窗点击 |
| 91069 | RESUME_LATER_GUIDE_DOWNLOAD_CANCEL | 继续 later 引导下载弹窗取消 |

---

## 核心漏斗与指标

### 最常用：跨环境全链路转化漏斗

这是日常查询最多的场景——追踪从 FB 广告到 Chrome 再到 PWA 安装的完整转化链路：

```
FB广告访问(11001) → Chrome访问(21001) → install点击(21003) → PWA安装
```

| 指标 | 计算方式 | 说明 |
|------|----------|------|
| fb访问 | `countIf(event_code = 11001)` | 广告环境内落地页访问 |
| chrome 访问 | `countIf(event_code = 21001)` | Chrome 内落地页访问 |
| install安装 | `countIf(event_code = 21003)` | install 点击 |
| 安装率 | `round(countIf(event_code = 21003) / nullIf(countIf(event_code = 21001), 0) * 100, 2)` | install点击 / Chrome访问 |
| chrome 访问率 | `round(countIf(event_code = 21001) / nullIf(countIf(event_code = 11001), 0) * 100, 2)` | Chrome访问 / FB访问 |

### 其他常用指标

| 指标 | 计算方式 | 说明 |
|------|----------|------|
| app 启动量 | `countIf(event_code = 21005)` | app 成功启动 |
| 安装准备 | `countIf(event_code = 21023)` | 原生安装事件准备好了 |
| 订阅率 | `round(countIf(event_code = 21025) / nullIf(countIf(event_code = 21024), 0) * 100, 2)` | 允许订阅 / 弹起订阅 |
| UV（独立用户数） | `countDistinct(uuid)` | |
| 某事件的 UV | `countDistinctIf(uuid, event_code = XXXX)` | |

### 各环境漏斗路径

- **正常场景（最常用）**：11001（FB访问）→ 21001（Chrome访问）→ 21003（install点击）→ 21005（app启动）
- **边玩边下**：91001（广告内访问）→ 91004（自动跳Chrome）→ 91005（成功进Chrome）→ 91023（安装准备）→ 91008（安装弹窗）→ 91003（安装允许）
- **iOS**：31001（Safari访问）→ 31003（添加到屏幕）→ 31012（PWA启动）

## 常用维度

| 维度 | 字段 | 说明 |
|------|------|------|
| 日期 | `toDate(fromUnixTimestamp(ts) + INTERVAL 8 HOUR)` | 北京时间日期 |
| 项目 | `project_id` | 不同投放项目 |
| 渠道 | `channel_id` | 流量渠道（见下方渠道枚举） |
| 包名 | `package` | PWA 应用包名 |
| 投放人 | `promoter` | 负责投放的人 |
| 国家 | `cf_ip_country` | Cloudflare 国家代码 |
| 操作系统 | `ua_os` | Android/iOS 等 |
| 浏览器 | `ua_browser` | Chrome/Safari 等 |
| 广告ID | `extractURLParameter(report_url, 'ad_id')` | 从 URL 提取 |
| 数据标记 | `data_mark` | NORMAL 为正常数据 |

### 渠道枚举（channel_id）

| channel_id | 渠道名称 | 说明 |
|------------|----------|------|
| 4 | FB (Facebook) | 主力渠道，流量最大 |
| 5 | TK (TikTok) | 短视频渠道 |
| 9 | KWAI (快手) | 短视频渠道 |
| 10 | GOOGLE | Google 广告 |
| 56 | MG_SKY_ADS (MgskyAds) | MgskyAds 渠道 |

> 这是完整的渠道枚举，查询时可直接用 `channel_id IN (4, 5, 9, 10, 56)` 过滤。

---

## 示例 SQL

### 1. 跨环境全链路转化漏斗（最常用）

从 FB 广告到 Chrome 到安装的完整转化率，支持按 channel_id/project_id 过滤：

```sql
SELECT
  toDate(fromUnixTimestamp(ts) + INTERVAL 8 HOUR) AS event_date,
  countIf(event_code = 11001) AS "fb访问",
  countIf(event_code = 21001) AS "chrome访问",
  countIf(event_code = 21003) AS "install安装",
  round(
    countIf(event_code = 21003) / nullIf(countIf(event_code = 21001), 0) * 100, 2
  ) AS "安装率",
  round(
    countIf(event_code = 21001) / nullIf(countIf(event_code = 11001), 0) * 100, 2
  ) AS "chrome访问率"
FROM roi_ods.pwa_event_point_log
WHERE ts >= toUnixTimestamp(today() - INTERVAL 7 DAY + INTERVAL 8 HOUR)
  AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)
  -- 常用过滤条件（按需取消注释）：
  -- AND channel_id = 4
  -- AND project_id = '9758092882'
  -- AND report_url LIKE '%domain.com%'
  -- AND extractURLParameter(report_url, 'ad_id') = 'xxx'
GROUP BY event_date
ORDER BY event_date
```

### 2. 按项目统计（指定 project_id）

```sql
SELECT
  toDate(fromUnixTimestamp(ts) + INTERVAL 8 HOUR) AS event_date,
  countIf(event_code = 21001) AS "落地页访问",
  countIf(event_code = 21005) AS "app启动",
  round(
    countIf(event_code = 21005) / nullIf(countIf(event_code = 21001), 0) * 100, 2
  ) AS "安装率%"
FROM roi_ods.pwa_event_point_log
WHERE project_id = '9758092882'
  AND ts >= toUnixTimestamp(today() - INTERVAL 7 DAY + INTERVAL 8 HOUR)
  AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)
GROUP BY event_date
ORDER BY event_date
```

### 3. 按渠道分组统计

```sql
SELECT
  channel_id,
  countIf(event_code = 21001) AS "落地页访问",
  countIf(event_code = 21005) AS "app启动",
  round(
    countIf(event_code = 21005) / nullIf(countIf(event_code = 21001), 0) * 100, 2
  ) AS "安装率%"
FROM roi_ods.pwa_event_point_log
WHERE ts >= toUnixTimestamp(today() - INTERVAL 7 DAY + INTERVAL 8 HOUR)
  AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)
GROUP BY channel_id
ORDER BY "落地页访问" DESC
```

### 4. 按投放人统计

```sql
SELECT
  promoter,
  countIf(event_code = 21001) AS "落地页访问",
  countIf(event_code = 21005) AS "app启动",
  round(
    countIf(event_code = 21005) / nullIf(countIf(event_code = 21001), 0) * 100, 2
  ) AS "安装率%"
FROM roi_ods.pwa_event_point_log
WHERE ts >= toUnixTimestamp(today() - INTERVAL 7 DAY + INTERVAL 8 HOUR)
  AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)
  AND length(promoter) > 0
GROUP BY promoter
ORDER BY "落地页访问" DESC
```

### 5. 按国家统计

```sql
SELECT
  cf_ip_country AS country,
  countIf(event_code = 21001) AS "落地页访问",
  countIf(event_code = 21005) AS "app启动",
  round(
    countIf(event_code = 21005) / nullIf(countIf(event_code = 21001), 0) * 100, 2
  ) AS "安装率%"
FROM roi_ods.pwa_event_point_log
WHERE ts >= toUnixTimestamp(today() - INTERVAL 7 DAY + INTERVAL 8 HOUR)
  AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)
  AND length(cf_ip_country) > 0
GROUP BY country
ORDER BY "落地页访问" DESC
LIMIT 20
```

### 6. 按广告ID统计（从 URL 提取）

```sql
SELECT
  extractURLParameter(report_url, 'ad_id') AS ad_id,
  substring(extractURLParameter(report_url, 'ad_name'), 1, 30) AS ad_name,
  countIf(event_code = 21001) AS "落地页访问",
  countIf(event_code = 21005) AS "app启动",
  round(
    countIf(event_code = 21005) / nullIf(countIf(event_code = 21001), 0) * 100, 2
  ) AS "安装率%"
FROM roi_ods.pwa_event_point_log
WHERE ts >= toUnixTimestamp(today() - INTERVAL 7 DAY + INTERVAL 8 HOUR)
  AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)
  AND length(extractURLParameter(report_url, 'ad_id')) > 0
GROUP BY ad_id, ad_name
ORDER BY "落地页访问" DESC
LIMIT 50
```

### 7. 查询所有事件码分布

```sql
SELECT
  event_code,
  count(*) AS cnt
FROM roi_ods.pwa_event_point_log
WHERE ts >= toUnixTimestamp(today() - INTERVAL 7 DAY + INTERVAL 8 HOUR)
  AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)
GROUP BY event_code
ORDER BY cnt DESC
```

### 8. 按域名统计

```sql
SELECT
  domain(report_url) AS site,
  countIf(event_code = 21001) AS "落地页访问",
  countIf(event_code = 21005) AS "app启动"
FROM roi_ods.pwa_event_point_log
WHERE ts >= toUnixTimestamp(today() - INTERVAL 7 DAY + INTERVAL 8 HOUR)
  AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)
  AND length(report_url) > 0
GROUP BY site
ORDER BY "落地页访问" DESC
LIMIT 20
```

### 9. UV 去重统计

```sql
SELECT
  toDate(fromUnixTimestamp(ts) + INTERVAL 8 HOUR) AS event_date,
  countDistinctIf(uuid, event_code = 21001) AS "访问UV",
  countDistinctIf(uuid, event_code = 21005) AS "启动UV",
  round(
    countDistinctIf(uuid, event_code = 21005) / nullIf(countDistinctIf(uuid, event_code = 21001), 0) * 100, 2
  ) AS "安装率%(UV)"
FROM roi_ods.pwa_event_point_log
WHERE ts >= toUnixTimestamp(today() - INTERVAL 7 DAY + INTERVAL 8 HOUR)
  AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)
GROUP BY event_date
ORDER BY event_date
```

### 10. 订阅漏斗

```sql
SELECT
  toDate(fromUnixTimestamp(ts) + INTERVAL 8 HOUR) AS event_date,
  countIf(event_code = 21024) AS "订阅弹窗",
  countIf(event_code = 21025) AS "允许订阅",
  countIf(event_code = 21026) AS "无操作",
  countIf(event_code = 21027) AS "拒绝订阅",
  round(
    countIf(event_code = 21025) / nullIf(countIf(event_code = 21024), 0) * 100, 2
  ) AS "订阅率%"
FROM roi_ods.pwa_event_point_log
WHERE ts >= toUnixTimestamp(today() - INTERVAL 7 DAY + INTERVAL 8 HOUR)
  AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)
GROUP BY event_date
ORDER BY event_date
```

### 11. 按包名统计安装量排行

```sql
SELECT
  package,
  countIf(event_code = 21001) AS "落地页访问",
  countIf(event_code = 21005) AS "app启动",
  round(
    countIf(event_code = 21005) / nullIf(countIf(event_code = 21001), 0) * 100, 2
  ) AS "安装率%"
FROM roi_ods.pwa_event_point_log
WHERE ts >= toUnixTimestamp(today() - INTERVAL 7 DAY + INTERVAL 8 HOUR)
  AND ts < toUnixTimestamp(today() + INTERVAL 8 HOUR)
  AND length(package) > 0
GROUP BY package
ORDER BY "app启动" DESC
LIMIT 20
```
