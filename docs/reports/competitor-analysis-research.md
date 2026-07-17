# 同行对标分析功能 — 全面技术调研报告

> 调研日期：2026-04-05
> 状态：调研完成，待技术方案设计

## 一、功能概述

### 目标能力

用户输入对标账号 URL，系统自动抓取账号主页/视频等信息，AI 分析生成结构化竞品分析报告。

### 核心流程

1. **选择行业赛道** — 覆盖抖音、视频号等主流平台 56+ 细分行业
2. **输入对标账号 URL**
3. **系统自动抓取** — 账号主页、视频列表、互动数据
4. **AI 生成分析报告** — 账号概况、IP 定位、粉丝画像、内容风格、发布频率、增长趋势、互动率、目标受众、对标建议

---

## 二、数据获取方案

### 2.1 各平台官方 API 现状

| 平台 | 官方 API | 限制 | 竞品分析可用性 |
|------|---------|------|--------------|
| **抖音** | developer.open-douyin.com | 仅限用户 OAuth 授权后查自己数据 | 不可用（无法查他人账号） |
| **快手** | open.kuaishou.com | 企业开发者注册，仍在内测 | 不可用 |
| **视频号** | 无 | 完全封闭，仅内置助手可看自己数据 | 不可用 |
| **B站** | 无官方，但有大量逆向 API | 社区文档 bilibili-API-collect (20K+ stars) | 可用（公开数据相对开放） |
| **小红书** | open.xiaohongshu.com | 仅电商/商家功能 | 不可用 |

**结论：官方 API 全军覆没，必须依赖第三方数据平台或爬虫。**

### 2.2 商业数据 API

#### 方案 A：TikHub.io（统一 API，最推荐）

- **覆盖平台**：抖音、小红书、B站、快手、微博、微信视频号 等 30+
- **API 端点**：1000+ 统一 RESTful 接口
- **定价**：$0.001/请求，量大 5 折（$0.0005/请求）
- **RPS**：免费 10 RPS，付费 $5-55/月 20-100 RPS
- **SDK**：Python、Java SDK
- **中国访问**：api.tikhub.io 被墙，需用 api.tikhub.dev
- **优势**：统一接口、集中维护、覆盖最广

#### 方案 B：Apify（云端 Actor 市场）

**平台定价：**

| 套餐 | 月费 | 含 credit | 每 CU 费率 | 最大并发 |
|------|------|----------|-----------|---------|
| Free | $0 | $5 | $0.30 | 25 |
| Starter | $29 | $29 | $0.30 | 32 |
| Scale | $199 | $199 | $0.25 | 128 |
| Business | $999 | $999 | $0.20 | 256 |

1 CU = 1 GB RAM x 1 小时

**已有的中国平台 Actor 清单：**

##### 抖音（10+ Actor）

| Actor | 开发者 | 定价 | 能力 |
|-------|--------|------|------|
| douyin-scraper | natanielsantos | $35/月 | 搜索+用户+视频，去水印下载 |
| douyin-search | kuaima | $20/月 | 关键词搜索 |
| douyin-user-post-scraper | apibox | $29/月 | 用户视频列表(by secUid) |
| douyin-comments-scraper | natanielsantos | 按用量 | 视频评论抓取 |
| douyin-transcripts-scraper | apple_yang | 按时长 | 视频转文字(中文 ASR) |
| high-accuracy-douyin-transcripts-scraper | apple_yang | 按时长 | 高精度中文转写 |
| douyin-video-downloader | scrapearchitect | $5/月 | 去水印 HD 下载 |
| douyin-video-downloader | easyapi | $19.99/月 | HD 视频+MP3 下载 |
| douyin-search-scraper | cloudcharlestom | 按用量 | 搜索+用户洞察 |
| hot-rank-scraper | cloudcharlestom | 按用量 | 跨平台热搜榜(抖音/知乎/B站/头条/虎扑/百度/澎湃) |

**抖音典型输出字段：**
```json
{
  "video_id": "7234567890123456789",
  "author_sec_uid": "MS4wLjABAAAA...",
  "author_nickname": "用户名",
  "desc": "视频描述 #话题",
  "create_time": 1700000000,
  "duration": 15,
  "ratio": "1080p",
  "cover": "https://...",
  "play_addr": "https://...",
  "digg_count": 50000,
  "comment_count": 1200,
  "collect_count": 8000,
  "share_count": 3000,
  "music_title": "原声",
  "music_author": "创作者"
}
```

##### 小红书（10+ Actor）

| Actor | 开发者 | 定价 | 能力 |
|-------|--------|------|------|
| rednote-xiaohongshu-search-scraper | easyapi | $4.99/千条 | 关键词搜索 |
| rednote-xiaohongshu-profile-scraper | easyapi | $4.99/千条 | 用户主页 |
| rednote-xiaohongshu-user-posts-scraper | easyapi | $4.99/千条 | 用户作品 |
| rednote-xiaohongshu-comments-scraper | easyapi | 按量 | 评论(含嵌套回复) |
| all-in-one-rednote-xiaohongshu-scraper | easyapi | $29.99/月 | 全功能合一 |
| rednote-xiaohongshu-search-scraper | datapilot | 按用量 | 住宅代理版搜索 |
| xiaohongshu | kuaima | $20/月 | 主页+频道 |
| xiaohongshu-search | kuaima | 租赁+用量 | 搜索+分页 |
| xiaohongshu-profile | kuaima | 租赁+用量 | 用户详情 |
| easy-rednote-xiaohongshu-scraper | buglesslogic | 按用量 | 搜索+评论+商品 |

##### B站

| Actor | 开发者 | 定价 | 能力 |
|-------|--------|------|------|
| bilibili-scraper | dltik | $1/千条 | 元数据(标题/播放/点赞/UP主) |
| bilibili-transcripts-scraper | apple_yang | $0.60/千条 | 视频转文字 |
| bilibili-video-downloader | easyapi | $2.99/千条 | HD 视频下载 |
| bilibili | kuaima | $20/月 | 主页数据 |
| bilibili-detail | kuaima | $20/月 | 视频详情 |

##### 快手

| Actor | 开发者 | 定价 | 能力 |
|-------|--------|------|------|
| kuaishou-scraper | natanielsantos | 按用量 | 视频数据+作者+音乐 |
| kwai-scraper | natanielsantos | 按用量 | 国际版 Kwai |

##### 微博

| Actor | 开发者 | 定价 | 能力 |
|-------|--------|------|------|
| weibo-scraper | piotrv1001 | 按用量 | 帖子+互动+头像 |
| weibo-feed-scraper | saswave | 按用量 | Feed+媒体下载(2K) |
| weibo-media-downloader | easyapi | 按量 | 高质量视频图片下载 |

**Apify 集成方式（Node.js）：**
```typescript
import { ApifyClient } from 'apify-client';
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

const run = await client.actor('apibox/douyin-user-post-scraper').call({
  userSecUid: 'MS4wLjABAAAA...',
  num: 50,
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

**Webhook 异步回调：**
```typescript
// 创建 webhook
await client.webhooks().create({
  condition: { actorId: 'ACTOR_ID' },
  requestUrl: 'https://your-app.com/api/apify-webhook',
  eventTypes: ['ACTOR.RUN.SUCCEEDED'],
});
```

**API 限制：**
- 全局：250,000 请求/分钟
- 单资源：60 请求/秒
- 超限返回 HTTP 429

**重要注意：**
- Rental 定价模式将于 2026.10 完全停止，届时全部转 pay-per-usage
- 中国平台 Actor 多为社区维护，反爬策略变化时可能失效
- 部分 Douyin Actor 有报告"大部分请求失败"的可靠性问题

#### 方案 C：新榜 (Newrank) API

- **覆盖**：微信公众号+视频号(新视)、抖音(新抖)、小红书(新红)、B站、快手(新快)
- **API 文档**：api.newrank.cn，注册送 2000 积分
- **个人会员**：280-600 元/年，企业 API 另议
- **优势**：覆盖视频号（其他方案难以覆盖的平台）

#### 其他第三方数据平台（无公开 API，仅 Dashboard）

| 平台 | 侧重 | 价格 | 特色 |
|------|------|------|------|
| 蝉妈妈 | 抖音电商直播 | ~12,000 元/年 | DeepSeek-R1 AI 视频拆解 |
| 飞瓜数据 | 抖音+快手全面 | 2,868-69,350 元/年 | 720天历史数据 |
| 考古加 | 抖音专精 | 99-1,999 元/月 | 实时直播监控 |
| 灰豚数据 | 淘抖快红 | 399 元/月起 | 性价比高 |
| 友望数据 | 视频号专精 | - | 视频号最佳选择 |

### 2.3 开源爬虫工具

#### 多平台工具

| 工具 | Stars | 平台 | 能力 | 语言 |
|------|-------|------|------|------|
| **MediaCrawler** | 47.3K | 小红书/抖音/快手/B站/微博/贴吧/知乎 | 搜索+详情+评论+创作者+下载+WebUI | Python |
| **Douyin_TikTok_Download_API** | 17K | 抖音/快手/TikTok/B站 | 异步批量+去水印+自托管API | Python |
| **TikTokDownloader** | 13.9K | 抖音/TikTok | 作品/点赞/收藏/评论/搜索/热榜 | Python |
| **yt-dlp** | 154.8K | 1000+ 平台 | 通用下载器，含抖音/B站/小红书 | Python |
| **you-get** | 56.8K | 中国主流视频站 | B站/优酷/爱奇艺/腾讯 | Python |
| **lux** | 31K | B站/爱奇艺/QQ/优酷 | Go 编写，速度快 | Go |
| **videodl** | 1.4K | 30+ 平台 | 轻量纯 Python | Python |
| **omniget** | 1.1K | 50+ 平台 | Electron 桌面应用 | JS |

#### 各平台专项工具

##### 抖音

| 工具 | Stars | 特色 |
|------|-------|------|
| f2 (Johnserf-Seed) | 2.4K | PyPI 可装，完整用户 API，支持直播弹幕 |
| douyin-downloader (jiji262) | 7.2K | 实用批量下载，SQLite 去重 |
| douyin-api (BatmKey) | 208 | 逆向 API wrapper |
| douyin-downloader (Rust) | 547 | Rust+Tauri 桌面应用 |

##### B站

| 工具 | Stars | 特色 |
|------|-------|------|
| bilibili-API-collect | 20.4K | 最全逆向 API 文档（非代码） |
| bilibili-api (Nemo2011) | 3.8K | Python SDK，含 TypeScript 版 |
| BBDown | 13.6K | C# 命令行下载器，支持 4K |
| bilibili-mcp-server | 182 | MCP Server，AI 代理集成 |

##### 小红书

| 工具 | Stars | 特色 |
|------|-------|------|
| XHS-Downloader | 10.7K | 采集+下载+MCP Server |
| Spider_XHS | 4.9K | JS 编写，全域操作方案 |
| ReaJason/xhs | 2.1K | 干净 Python SDK |
| xhshow (Cloxl) | 823 | 纯算法签名实现(x-s, x-s-common) |
| xhs_ai_publisher | 1.9K | AI 内容创作+发布 |

##### 快手

| 工具 | Stars | 特色 |
|------|-------|------|
| KS-Downloader | 730 | 去水印+数据采集+Docker |

##### 视频号（最难平台）

| 工具 | Stars | 特色 |
|------|-------|------|
| wx_channels_download | 5.2K | Go 编写，代理拦截方式 |
| wechatVideoDownload | 4.8K | 视频/直播回放/图片 |
| WeChatVideoDownloader | 4.7K | 极简下载器 |

**视频号限制**：无 API、无逆向接口，仅能通过本地客户端拦截下载视频，无法批量获取元数据/搜索。

### 2.4 商业爬虫服务

| 服务 | 特色 | 中国平台支持 |
|------|------|------------|
| Bright Data | 72M+ IP 代理，98.44% 成功率 | 抖音、小红书、B站 |
| Scrapyman | API 爬虫 | 抖音、小红书 |
| Octoparse | 无代码可视化爬虫 | 小红书模板 |
| RealData API | API 服务 | 抖音 |

---

## 三、AI 分析报告生成

### 3.1 Pipeline 架构

```
输入账号 URL
  → [Scrape Worker] 抓取账号元数据 + 视频列表 + 互动数据
  → [Enrich Worker] 视频转文字(ASR) + 封面图提取 + OCR
  → [AI Worker] Claude API 结构化输出 → 多维度分析报告
  → [Report] 存库 + 可视化渲染
```

### 3.2 AI 分析维度（6维雷达图）

```typescript
interface AccountScore {
  content_power: number;       // 内容力 (0-100)
  growth_power: number;        // 涨粉力 (0-100)
  engagement_power: number;    // 互动力 (0-100)
  monetization_power: number;  // 变现力 (0-100)
  persona_power: number;       // 人设力 (0-100)
  operation_power: number;     // 运营力 (0-100)
}
```

### 3.3 评分计算

**加权互动率：**
```
ER = (点赞×0.5 + 评论×2 + 转发×4 + 收藏×3) / 播放量 × 100
```

**涨粉率：**
```
日涨粉率 = (今日粉丝 - 昨日粉丝) / 昨日粉丝 × 100
30日涨粉率 = (第30天粉丝 - 第1天粉丝) / 第1天粉丝 × 100
增长稳定性 = 1 - stddev(日涨粉率) / mean(日涨粉率)
```

**内容力评分：**
```
内容力 = 平均完播率(估算)×30% + 平均互动率×25% + 爆款率(>2x均值)×20% + 选题多样性×10% + 发布稳定性×15%
```

**综合评分 = 各维度加权平均：**
```
[内容力×0.25, 涨粉力×0.20, 互动力×0.20, 变现力×0.15, 人设力×0.10, 运营力×0.10]
```

### 3.4 AI 报告 Prompt 模板

```
基于以下账号数据，生成完整的竞品分析报告：

## 账号基本信息
{account_metadata_json}

## 近期视频数据（最近30条）
{video_list_json}

## 视频文案/字幕提取
{transcripts_json}

请从以下六个维度分析：

### 1. 账号定位分析
- 账号人设定位（IP类型、风格调性）
- 目标受众画像推断
- 内容赛道与垂直领域
- 差异化卖点

### 2. 内容策略分析
- 选题方向与主题分布
- 爆款内容公式拆解（Hook结构、标题策略、节奏把控）
- 发布频率与时间规律
- 内容形式（口播/剧情/混剪/街拍等）

### 3. 粉丝增长分析
- 涨粉趋势与增长拐点
- 涨粉驱动因素（爆款视频/投流/事件）
- 粉丝粘性指标

### 4. 互动数据分析
- 平均互动率
- 互动质量评估
- 数据异常检测（刷量/投流痕迹）

### 5. 变现模式分析
- 变现路径（带货/广告/知识付费/引流私域）
- 商品品类与价格带
- 带货转化效率推断

### 6. 对标建议
- 可复用的内容策略
- 差异化切入点
- 短期行动计划（30天）
- 风险提示
```

### 3.5 视频内容分析

- **转文字**：Whisper v3 / SenseVoice（阿里，中文方言更好）
- **封面分析**：Claude Vision 批量分析缩略图风格、色调、文字、构图
- **内容模式识别**：Hook 黄金3秒、内容弧线、剪辑节奏、爆款公式拆解
- **帧采样**：FFmpeg 每 20s 提取 1 帧 → Claude Vision 场景分类

### 3.6 可视化图表

| 图表类型 | 用途 |
|---------|------|
| 雷达图 | 6维账号评分，可叠加对比 |
| 折线图 | 粉丝增长趋势 |
| 柱状图 | 各视频互动对比 |
| 热力图 | 发布时间分布(星期×小时) |
| 树图 | 内容主题分布 |
| 散点图 | 互动率 vs 播放量(识别爆款) |
| 仪表盘 | 单维度 0-100 评分 |

---

## 四、竞品分析

### 4.1 数据分析平台

| 产品 | 定位 | 特色 | 缺陷 |
|------|------|------|------|
| 飞瓜数据 | 数据最全 | 720天历史、多平台 | UI 差、无 AI 洞察 |
| 蝉妈妈 | 电商直播 | GMV 追踪、AI 视频拆解 | 仅电商场景 |
| 考古加 | 直播电商 | 实时监控、分级流量分析 | 抖音单一平台 |
| 灰豚数据 | 性价比 | 399元/月核心数据 | 功能较基础 |
| 新抖 | 内容行业 | 数据资源库丰富 | 中等价位 |

### 4.2 AI 原生工具

| 产品 | 定位 | 特色 |
|------|------|------|
| 灵感岛 | AI 内容+账号规划 | 6个 AI Agent，输入对标URL一键生成同款公式 |
| 即创(字节) | AIGC 内容生产 | AI脚本+数字人+爆款克隆，免费内测 |
| 蝉妈妈 AI | 电商 AI 助手 | DeepSeek-R1 驱动视频拆解 |
| Coze 工作流 | DIY 分析 Agent | 23维度数据，需自行搭建 |

### 4.3 市场缺口

**没有产品同时做到**：数据全 + AI 洞察 + UI 精美 + 产品化体验。

- 飞瓜/蝉妈妈：数据重但 UI 差，无 AI 生成洞察
- 灵感岛/即创：重创作轻分析
- Coze 工作流：强大但需 DIY，非产品化

**ClipFlow 的机会**：打包的 AI 驱动竞品分析产品，精美 Dashboard + 结构化报告。

---

## 五、法律合规

### 5.1 相关法律

| 法律 | 生效时间 | 关键约束 |
|------|---------|---------|
| 网络安全法 | 2017.6 | 需网络运营者同意，禁止突破安全措施 |
| 数据安全法 | 2021.9 | 分类保护，跨境限制 |
| 个人信息保护法 | 2021.11 | 需明确同意处理个人数据 |
| 反不正当竞争法(修订) | 2025 | 第13条针对数据竞争 |
| 网络数据安全管理条例 | 2024 | 第18条：自动化工具不得非法入侵 |

### 5.2 风险数据

- 截至 2025.3 已有 **260+ 爬虫案件**，含 70+ 刑事案件、40+ 行政执法
- 魔蝎科技案：公司罚 3000 万，CEO 判 3 年（缓 4 年）

### 5.3 合规建议

1. **优先用付费 API**（TikHub/Apify/新榜）而非直接爬
2. **不突破反爬措施**（验证码/登录墙/加密）
3. **不采集个人信息**（仅聚合公开数据）
4. **存储脱敏/聚合数据** 以降低 PIPL 风险
5. **控制请求频率**，不超过目标站平均 QPS 的 10 倍
6. **不复制平台服务** — 聚合转化数据而非镜像
7. **记录数据来源和法律依据**

---

## 六、推荐实施方案

### 6.1 数据获取分层策略

| 层级 | 方案 | 用途 | 成本 |
|------|------|------|------|
| Tier 1 | TikHub API | 主力：抖音/小红书/B站/快手 统一接口 | ~$75-100/月 |
| Tier 2 | Apify Actor | 补充：转文字、评论深挖、热搜榜 | ~$199/月 |
| Tier 3 | 新榜 API | 跨平台排行榜+视频号数据 | ~600元/年 |
| Tier 4 | 飞瓜/蝉妈妈 | 粉丝画像等深度数据 | ~12,000元/年 |
| Fallback | MediaCrawler/f2 | 自托管爬虫备用 | 服务器成本 |

### 6.2 各平台可行性

| 平台 | 获取难度 | 最佳方案 | 粉丝画像来源 |
|------|---------|---------|------------|
| 抖音 | 中 | TikHub + Apify | 飞瓜/蝉妈妈(付费) |
| 小红书 | 中 | TikHub + Apify easyapi | 新红(付费) |
| B站 | 低 | 逆向 API + TikHub | 评论分析推断 |
| 快手 | 中 | TikHub + MediaCrawler | 灰豚(付费) |
| 视频号 | **高** | 新榜(新视) + 友望数据 | 极难获取 |

### 6.3 月度成本估算

| 项目 | 月费估算 |
|------|---------|
| TikHub API（日均 5000 请求） | ~$75-100 |
| Apify Scale 套餐 | $199 |
| Claude API（报告生成） | ~$50-100 |
| ASR 转写 | ~$30-50 |
| **总计** | **~$350-450/月** |

---

## 七、关键参考资源

### 商业 API

- TikHub: https://tikhub.io/ | Docs: https://docs.tikhub.io/
- Apify: https://apify.com/ | Docs: https://docs.apify.com/
- 新榜 API: https://api.newrank.cn/

### 开源工具

- MediaCrawler: https://github.com/NanmiCoder/MediaCrawler (47.3K stars)
- TikTokDownloader: https://github.com/JoeanAmier/TikTokDownloader (13.9K stars)
- Douyin_TikTok_Download_API: https://github.com/Evil0ctal/Douyin_TikTok_Download_API (17K stars)
- f2: https://github.com/Johnserf-Seed/f2 (2.4K stars)
- bilibili-API-collect: https://github.com/SocialSisterYi/bilibili-API-collect (20.4K stars)
- XHS-Downloader: https://github.com/JoeanAmier/XHS-Downloader (10.7K stars)
- ReaJason/xhs: https://github.com/ReaJason/xhs (2.1K stars)
- KS-Downloader: https://github.com/JoeanAmier/KS-Downloader (730 stars)

### 数据平台

- 飞瓜数据: https://www.feigua.cn/
- 蝉妈妈: https://www.chanmama.com/
- 考古加: https://www.kaogujia.com/
- 灰豚数据: https://www.huitun.com/
- 友望数据: https://www.youwant.cn/
- 新抖: https://xd.newrank.cn/
- 新红: https://xh.newrank.cn/
- 新视: https://xs.newrank.cn/
