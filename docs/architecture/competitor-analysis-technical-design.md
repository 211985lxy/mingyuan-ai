# 同行对标分析 — 技术方案设计

> 文档日期：2026-04-05
> 基于：competitor-analysis-research.md 调研结果 + 明远AIM 现有架构分析

---

## 一、产品目标

用户输入对标账号 URL（支持抖音/小红书/B站/快手），系统自动抓取账号数据，AI 生成结构化竞品分析报告，包含 6 维雷达评分 + 可操作建议。

### 核心用户旅程

```
输入对标账号URL → 平台自动识别 → 异步数据采集 → AI 分析 → 查看报告 → 对标建议应用到创作
```

### MVP 范围

- **Phase 1（MVP）**：抖音 + 小红书（最高优先级平台）
- **Phase 2**：B站 + 快手
- **Phase 3**：视频号（依赖第三方数据平台，独立评估）

---

## 二、系统架构

### 2.1 整体流程

```
┌─────────────────────────────────────────────────────┐
│                  Client (Next.js Pages)              │
│                                                      │
│  1. 输入URL → POST /api/competitor/analyze           │
│  2. 轮询状态 → GET /api/competitor/[id]              │
│  3. 查看报告 → 雷达图 + 分段报告                       │
└────────────┬────────────────────────────┬────────────┘
             │                            │
             ▼                            ▼
┌─────────────────────────────────────────────────────┐
│                  API Layer (Route Handlers)           │
│                                                      │
│  POST /api/competitor/analyze                        │
│    → 验证URL → 识别平台 → 创建 CompetitorAnalysis    │
│    → 触发异步 pipeline → 返回 analysisId             │
│                                                      │
│  GET /api/competitor/[id]                            │
│    → 返回状态 + 已完成步骤的数据                       │
│                                                      │
│  GET /api/competitor/reports                         │
│    → 当前用户的历史分析列表                             │
│                                                      │
│  DELETE /api/competitor/[id]                          │
│    → 删除分析记录                                     │
└────────────┬────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────┐
│           Async Pipeline (In-Process)                │
│                                                      │
│  Step 1: SCRAPE                                      │
│    → TikHub API: 账号信息 + 视频列表 + 视频统计       │
│    → 存储 rawAccountData + rawVideoData              │
│                                                      │
│  Step 2: ENRICH                                      │
│    → 提取 Top 10 视频封面图 URL                       │
│    → 评论采样（Top 5 视频各 20 条）                    │
│    → 计算量化指标（互动率/发布频率/增长等）             │
│                                                      │
│  Step 3: ANALYZE                                     │
│    → Claude API 结构化输出                            │
│    → 6 维评分 + 分段报告                              │
│    → 存储 analysisResult                             │
│                                                      │
│  Status: pending → scraping → enriching → analyzing  │
│          → completed / failed                        │
└─────────────────────────────────────────────────────┘
```

### 2.2 为什么不用 BullMQ

ClipFlow 当前没有独立 worker 进程或 BullMQ。现有异步模式是：
- API Route 内部触发异步逻辑（非阻塞 `Promise`，不 await）
- Webhook 回调（Shanjian/Aliyun）
- Cron 路由定时任务

**方案**：沿用现有模式 — API Route 内触发 pipeline，使用 `Promise` 非阻塞执行。pipeline 内部通过 DB 状态更新追踪进度，前端轮询。

```typescript
// 触发方式（与 marketing-analysis 模式一致）
export async function POST(req: NextRequest) {
  // ... 验证、创建记录

  // 非阻塞触发 pipeline
  runCompetitorAnalysisPipeline(analysis.id).catch(err => {
    logger.error({ err, analysisId: analysis.id }, 'Pipeline failed');
  });

  return NextResponse.json({ id: analysis.id, status: 'pending' });
}
```

---

## 三、数据模型

### 3.1 Prisma Schema 新增

```prisma
model CompetitorAnalysis {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])

  // 输入
  targetUrl         String   @db.VarChar(500)
  platform          String   @db.VarChar(20)   // douyin | xiaohongshu | bilibili | kuaishou
  platformUserId    String?  @db.VarChar(200)  // sec_user_id / user_id / uid

  // Pipeline 状态
  status            String   @default("pending") @db.VarChar(20)
  // pending → scraping → enriching → analyzing → completed → failed
  currentStep       String?  @db.VarChar(20)
  errorMessage      String?  @db.Text

  // 原始数据（JSON）
  rawAccountData    Json?    // 平台返回的账号信息
  rawVideoData      Json?    // 视频列表 + 统计数据
  rawCommentData    Json?    // 评论采样

  // 计算指标
  metricsData       Json?    // 量化指标（互动率、发布频率等）

  // AI 分析结果
  analysisResult    Json?    // 完整报告 JSON（6维评分 + 叙述）
  overallScore      Int?     // 综合评分 0-100

  // 缓存的展示数据
  accountName       String?  @db.VarChar(100)
  accountAvatar     String?  @db.VarChar(500)
  followerCount     Int?
  videoCount        Int?

  // 时间戳
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  completedAt       DateTime?

  // 费用追踪
  apiCostUsd        Float?   @default(0)

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, platform])
}
```

### 3.2 分析结果 JSON 结构

```typescript
interface CompetitorAnalysisResult {
  // 6 维雷达评分
  scores: {
    content_power: number;       // 内容力 0-100
    growth_power: number;        // 涨粉力 0-100
    engagement_power: number;    // 互动力 0-100
    monetization_power: number;  // 变现力 0-100
    persona_power: number;       // 人设力 0-100
    operation_power: number;     // 运营力 0-100
    overall: number;             // 综合 0-100
  };

  // 分段报告
  sections: {
    account_overview: {
      account_type: string;        // 个人IP / 企业号 / MCN
      content_vertical: string;    // 内容赛道
      positioning: string;         // IP 定位描述
      differentiator: string;      // 差异化卖点
    };
    content_strategy: {
      topic_distribution: Array<{ topic: string; percentage: number }>;
      content_formats: Array<{ format: string; percentage: number }>;
      hook_patterns: string[];     // 常用 Hook 手法
      posting_frequency: string;   // 发布频率描述
      best_posting_times: string;  // 最佳发布时间
      viral_formula: string;       // 爆款公式总结
    };
    growth_analysis: {
      growth_trend: string;        // 增长趋势描述
      growth_drivers: string[];    // 增长驱动因素
      follower_quality: string;    // 粉丝质量评估
    };
    engagement_analysis: {
      avg_engagement_rate: number;
      avg_likes: number;
      avg_comments: number;
      avg_shares: number;
      comment_quality: string;     // 评论质量评估
      anomaly_detection: string;   // 数据异常检测
    };
    monetization_analysis: {
      monetization_paths: string[];   // 变现路径
      product_categories: string[];   // 商品品类
      estimated_revenue_level: string; // 预估收入水平
    };
    recommendations: {
      reusable_strategies: string[];  // 可复用策略
      differentiation_points: string[]; // 差异化切入点
      action_plan_30d: string[];     // 30天行动计划
      risks: string[];               // 风险提示
    };
  };

  // 原始统计
  stats: {
    total_videos_analyzed: number;
    date_range: { from: string; to: string };
    top_videos: Array<{
      title: string;
      views: number;
      likes: number;
      engagement_rate: number;
      url: string;
    }>;
    posting_heatmap: Record<string, number>; // "Mon-09": 3, "Tue-14": 5, ...
  };
}
```

### 3.3 量化指标 JSON 结构

```typescript
interface CompetitorMetrics {
  // 互动指标
  engagement: {
    avg_likes: number;
    avg_comments: number;
    avg_shares: number;
    avg_collects: number;
    avg_views: number;
    weighted_engagement_rate: number;  // 加权互动率
    like_to_comment_ratio: number;
  };

  // 发布指标
  publishing: {
    total_videos: number;
    avg_per_week: number;
    avg_per_month: number;
    most_active_day: string;    // "Wednesday"
    most_active_hour: number;   // 14
    consistency_score: number;  // 0-100
  };

  // 内容指标
  content: {
    avg_duration_seconds: number;
    duration_distribution: Record<string, number>; // "<15s": 30, "15-60s": 50, ...
    viral_ratio: number;        // 爆款率（>2x 均值播放的视频占比）
    top_hashtags: Array<{ tag: string; count: number }>;
  };
}
```

---

## 四、数据采集层

### 4.1 TikHub API 客户端

```typescript
// lib/tikhub/client.ts

const TIKHUB_BASE = process.env.TIKHUB_BASE_URL || 'https://api.tikhub.io';

interface TikHubResponse<T = unknown> {
  code: number;
  data: T | null;
  message: string;
  router: string;
  cache_url?: string | null;
}

async function tikhubGet<T>(
  endpoint: string,
  params: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${TIKHUB_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.TIKHUB_API_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`TikHub ${endpoint} failed: ${res.status}`);
  }

  const json: TikHubResponse<T> = await res.json();
  if (json.code !== 200 || !json.data) {
    throw new Error(`TikHub ${endpoint} error: ${json.message}`);
  }

  return json.data;
}
```

### 4.2 平台适配器

```typescript
// lib/tikhub/adapters/douyin.ts

interface NormalizedAccount {
  platformUserId: string;
  nickname: string;
  avatar: string;
  signature: string;
  followerCount: number;
  followingCount: number;
  totalLikes: number;
  videoCount: number;
  isVerified: boolean;
  verifyInfo: string;
}

interface NormalizedVideo {
  videoId: string;
  title: string;
  coverUrl: string;
  videoUrl: string;
  createTime: number;
  duration: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  collects: number;
}

// 每个平台实现同一接口
interface PlatformAdapter {
  resolveUrl(url: string): Promise<string>;                     // URL → platformUserId
  fetchAccount(userId: string): Promise<NormalizedAccount>;       // 账号信息
  fetchVideos(userId: string, count: number): Promise<NormalizedVideo[]>; // 视频列表
  fetchVideoStats(videoIds: string[]): Promise<Map<string, VideoStats>>; // 批量统计
  fetchComments(videoId: string, count: number): Promise<NormalizedComment[]>; // 评论
}
```

**各平台适配器使用的 TikHub 端点：**

| 步骤 | 抖音 | 小红书 | B站 | 快手 |
|------|------|--------|-----|------|
| URL解析 | get_sec_user_id | get_user_id_and_xsec_token | 从URL提取uid | fetch_get_user_id |
| 账号信息 | app/v3/handler_user_profile | app_v2/get_user_info | web/fetch_user_profile + fetch_user_relation_stat | web/fetch_user_info |
| 视频列表 | app/v3/fetch_user_post_videos | app_v2/get_user_posted_notes | web/fetch_user_post_videos | web/fetch_user_post |
| 视频统计 | app/v3/fetch_multi_video_statistics | (含在 note 详情中) | web/fetch_one_video | app/fetch_one_video |
| 评论 | web/fetch_video_comments | app_v2/get_note_comments | web/fetch_video_comments | app/fetch_one_video_comment |

### 4.3 URL 识别

```typescript
// lib/tikhub/url-parser.ts

type Platform = 'douyin' | 'xiaohongshu' | 'bilibili' | 'kuaishou';

function detectPlatform(url: string): Platform | null {
  const u = url.toLowerCase();
  if (u.includes('douyin.com') || u.includes('iesdouyin.com')) return 'douyin';
  if (u.includes('xiaohongshu.com') || u.includes('xhslink.com') || u.includes('xhs.cn')) return 'xiaohongshu';
  if (u.includes('bilibili.com') || u.includes('b23.tv')) return 'bilibili';
  if (u.includes('kuaishou.com') || u.includes('gifshow.com') || u.includes('chenzhongtech.com')) return 'kuaishou';
  return null;
}
```

### 4.4 请求成本估算

| 单次分析 | 请求数 | 成本 |
|---------|--------|------|
| 抖音（基础） | ~14 | ~$0.06 |
| 抖音（含星图） | ~22 | ~$0.20 |
| 小红书 | ~12 | ~$0.012 |
| B站 | ~10 | ~$0.01 |
| 快手 | ~10 | ~$0.01 |

按日均 50 次分析，月成本 ≈ $90-150（TikHub 部分）。

---

## 五、AI 分析层

### 5.1 分析 Prompt 设计

复用现有 `LLMClient.shared()` 模式，使用 Claude Sonnet 4.6（分析型任务首选）。

```typescript
// lib/competitor-analysis/analyzer.ts

async function analyzeCompetitor(
  account: NormalizedAccount,
  videos: NormalizedVideo[],
  comments: NormalizedComment[],
  metrics: CompetitorMetrics,
): Promise<CompetitorAnalysisResult> {
  const llm = LLMClient.shared();

  const systemPrompt = `你是专业的短视频账号分析师，擅长分析中国主流短视频平台（抖音/小红书/B站/快手）的创作者账号。
你会基于账号数据生成结构化的竞品分析报告，包含6维评分和可操作建议。
所有分析必须基于数据，不可臆测。输出严格按照 JSON Schema 格式。`;

  const userPrompt = `请分析以下短视频账号并生成竞品分析报告。

## 账号基本信息
${JSON.stringify(account, null, 2)}

## 近期视频数据（${videos.length}条）
${JSON.stringify(videos.map(v => ({
  title: v.title,
  duration: v.duration,
  views: v.views,
  likes: v.likes,
  comments: v.comments,
  shares: v.shares,
  collects: v.collects,
  createTime: new Date(v.createTime * 1000).toISOString(),
})), null, 2)}

## 量化指标
${JSON.stringify(metrics, null, 2)}

## 评论样本（Top 5 视频各取 20 条高赞评论）
${JSON.stringify(comments.slice(0, 100).map(c => ({
  text: c.text,
  likes: c.likes,
})), null, 2)}

请按以下6个维度评分(0-100)并生成分析报告：
1. 内容力(content_power): 内容质量、选题能力、创意水平、爆款率
2. 涨粉力(growth_power): 粉丝增长速度、增长稳定性、粉丝质量
3. 互动力(engagement_power): 互动率、评论质量、粉丝活跃度
4. 变现力(monetization_power): 变现效率、商业价值、带货能力
5. 人设力(persona_power): IP辨识度、人设一致性、信任感
6. 运营力(operation_power): 发布稳定性、平台规则适配、数据意识

综合评分 = content_power×0.25 + growth_power×0.20 + engagement_power×0.20 + monetization_power×0.15 + persona_power×0.10 + operation_power×0.10`;

  const result = await llm.complete({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 4000,
    responseFormat: { type: 'json_object' },
  });

  return JSON.parse(result.content) as CompetitorAnalysisResult;
}
```

### 5.2 Token 预算

| 部分 | 估算 Token |
|------|-----------|
| System prompt | ~200 |
| 账号信息 | ~300 |
| 50 条视频数据 | ~3,000 |
| 量化指标 | ~500 |
| 100 条评论 | ~2,000 |
| **Input 总计** | **~6,000** |
| **Output** | **~3,000** |
| **总计** | **~9,000** |

按 Claude Sonnet 4.6 定价（$3/M input, $15/M output）：
- 单次分析成本 ≈ $0.018 + $0.045 = **~$0.06**
- 日均 50 次 ≈ $3/天 ≈ **$90/月**

---

## 六、Pipeline 实现

### 6.1 核心流程

```typescript
// lib/competitor-analysis/pipeline.ts

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getAdapter } from '@/lib/tikhub/adapters';
import { calculateMetrics } from './metrics';
import { analyzeCompetitor } from './analyzer';

export async function runCompetitorAnalysisPipeline(analysisId: string): Promise<void> {
  const log = logger.child({ analysisId });

  try {
    const analysis = await prisma.competitorAnalysis.findUniqueOrThrow({
      where: { id: analysisId },
    });

    const adapter = getAdapter(analysis.platform);

    // Step 1: SCRAPE
    await updateStatus(analysisId, 'scraping');
    log.info('Step 1: Scraping account data');

    const platformUserId = analysis.platformUserId
      || await adapter.resolveUrl(analysis.targetUrl);

    const account = await adapter.fetchAccount(platformUserId);
    const videos = await adapter.fetchVideos(platformUserId, 50);

    // 批量获取视频统计（播放量等）
    const videoIds = videos.map(v => v.videoId);
    const stats = await adapter.fetchVideoStats(videoIds);
    const videosWithStats = videos.map(v => ({
      ...v,
      views: stats.get(v.videoId)?.views ?? v.views,
    }));

    await prisma.competitorAnalysis.update({
      where: { id: analysisId },
      data: {
        platformUserId,
        rawAccountData: account as any,
        rawVideoData: videosWithStats as any,
        accountName: account.nickname,
        accountAvatar: account.avatar,
        followerCount: account.followerCount,
        videoCount: account.videoCount,
      },
    });

    // Step 2: ENRICH
    await updateStatus(analysisId, 'enriching');
    log.info('Step 2: Enriching with comments + metrics');

    // 采样 Top 5 热门视频的评论
    const topVideos = [...videosWithStats]
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 5);

    const allComments = [];
    for (const video of topVideos) {
      const comments = await adapter.fetchComments(video.videoId, 20);
      allComments.push(...comments.map(c => ({ ...c, videoId: video.videoId })));
    }

    const metrics = calculateMetrics(account, videosWithStats);

    await prisma.competitorAnalysis.update({
      where: { id: analysisId },
      data: {
        rawCommentData: allComments as any,
        metricsData: metrics as any,
      },
    });

    // Step 3: ANALYZE
    await updateStatus(analysisId, 'analyzing');
    log.info('Step 3: AI analysis');

    const result = await analyzeCompetitor(
      account,
      videosWithStats,
      allComments,
      metrics,
    );

    await prisma.competitorAnalysis.update({
      where: { id: analysisId },
      data: {
        status: 'completed',
        analysisResult: result as any,
        overallScore: result.scores.overall,
        completedAt: new Date(),
      },
    });

    log.info({ overallScore: result.scores.overall }, 'Analysis completed');

  } catch (err) {
    log.error({ err }, 'Pipeline failed');
    await prisma.competitorAnalysis.update({
      where: { id: analysisId },
      data: {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
  }
}

async function updateStatus(id: string, status: string) {
  await prisma.competitorAnalysis.update({
    where: { id },
    data: { status, currentStep: status },
  });
}
```

### 6.2 指标计算

```typescript
// lib/competitor-analysis/metrics.ts

export function calculateMetrics(
  account: NormalizedAccount,
  videos: NormalizedVideo[],
): CompetitorMetrics {
  const totalVideos = videos.length;
  if (totalVideos === 0) {
    return getEmptyMetrics();
  }

  // 互动指标
  const avgLikes = avg(videos.map(v => v.likes));
  const avgComments = avg(videos.map(v => v.comments));
  const avgShares = avg(videos.map(v => v.shares));
  const avgCollects = avg(videos.map(v => v.collects));
  const avgViews = avg(videos.map(v => v.views));

  // 加权互动率
  const weightedER = avgViews > 0
    ? (avgLikes * 0.5 + avgComments * 2 + avgShares * 4 + avgCollects * 3) / avgViews * 100
    : 0;

  // 发布频率
  const sortedByTime = [...videos].sort((a, b) => a.createTime - b.createTime);
  const firstDate = new Date(sortedByTime[0].createTime * 1000);
  const lastDate = new Date(sortedByTime[sortedByTime.length - 1].createTime * 1000);
  const daySpan = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
  const avgPerWeek = (totalVideos / daySpan) * 7;
  const avgPerMonth = (totalVideos / daySpan) * 30;

  // 发布时间分布
  const hourCounts: Record<number, number> = {};
  const dayCounts: Record<string, number> = {};
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const v of videos) {
    const d = new Date(v.createTime * 1000);
    const hour = d.getHours();
    const day = days[d.getDay()];
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  }
  const mostActiveHour = Number(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12);
  const mostActiveDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Mon';

  // 发布稳定性（一致性评分）
  const weeklyBuckets = groupByWeek(videos);
  const weeklyPostCounts = Object.values(weeklyBuckets).map(v => v.length);
  const consistencyScore = weeklyPostCounts.length > 1
    ? Math.max(0, 100 - (stddev(weeklyPostCounts) / Math.max(1, avg(weeklyPostCounts))) * 100)
    : 50;

  // 爆款率
  const viewThreshold = avgViews * 2;
  const viralCount = videos.filter(v => v.views > viewThreshold).length;
  const viralRatio = viralCount / totalVideos;

  // 时长分布
  const durationDist: Record<string, number> = {
    '<15s': 0, '15-60s': 0, '1-3min': 0, '3-5min': 0, '>5min': 0,
  };
  for (const v of videos) {
    if (v.duration < 15) durationDist['<15s']++;
    else if (v.duration < 60) durationDist['15-60s']++;
    else if (v.duration < 180) durationDist['1-3min']++;
    else if (v.duration < 300) durationDist['3-5min']++;
    else durationDist['>5min']++;
  }

  // Hashtag 统计
  const tagCounts: Record<string, number> = {};
  for (const v of videos) {
    const tags = v.title.match(/#[\w\u4e00-\u9fff]+/g) || [];
    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const topHashtags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  return {
    engagement: {
      avg_likes: Math.round(avgLikes),
      avg_comments: Math.round(avgComments),
      avg_shares: Math.round(avgShares),
      avg_collects: Math.round(avgCollects),
      avg_views: Math.round(avgViews),
      weighted_engagement_rate: round2(weightedER),
      like_to_comment_ratio: avgComments > 0 ? round2(avgLikes / avgComments) : 0,
    },
    publishing: {
      total_videos: totalVideos,
      avg_per_week: round2(avgPerWeek),
      avg_per_month: round2(avgPerMonth),
      most_active_day: mostActiveDay,
      most_active_hour: mostActiveHour,
      consistency_score: Math.round(consistencyScore),
    },
    content: {
      avg_duration_seconds: Math.round(avg(videos.map(v => v.duration))),
      duration_distribution: durationDist,
      viral_ratio: round2(viralRatio),
      top_hashtags: topHashtags,
    },
  };
}

function avg(arr: number[]): number { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function stddev(arr: number[]): number {
  const m = avg(arr);
  return Math.sqrt(avg(arr.map(x => (x - m) ** 2)));
}
function round2(n: number): number { return Math.round(n * 100) / 100; }
```

---

## 七、API 路由设计

### 7.1 路由列表

| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| POST | /api/competitor/analyze | 提交分析请求 | 需要 |
| GET | /api/competitor/reports | 历史分析列表 | 需要 |
| GET | /api/competitor/[id] | 单个分析详情+状态 | 需要 |
| DELETE | /api/competitor/[id] | 删除分析记录 | 需要 |

### 7.2 请求/响应格式

**POST /api/competitor/analyze**

```typescript
// Request
{ url: string }  // 支持抖音/小红书/B站/快手的用户主页 URL

// Response 200
{ id: string, status: 'pending', platform: string }

// Response 400
{ error: 'UNSUPPORTED_PLATFORM' | 'INVALID_URL' }
```

**GET /api/competitor/[id]**

```typescript
// Response 200
{
  id: string;
  status: 'pending' | 'scraping' | 'enriching' | 'analyzing' | 'completed' | 'failed';
  platform: string;
  targetUrl: string;

  // 逐步填充（scraping 完成后可用）
  accountName?: string;
  accountAvatar?: string;
  followerCount?: number;
  videoCount?: number;

  // enriching 完成后可用
  metricsData?: CompetitorMetrics;

  // analyzing 完成后可用
  analysisResult?: CompetitorAnalysisResult;
  overallScore?: number;

  // 失败信息
  errorMessage?: string;

  createdAt: string;
  completedAt?: string;
}
```

**GET /api/competitor/reports**

```typescript
// Query: ?page=1&limit=10
// Response 200
{
  items: Array<{
    id: string;
    platform: string;
    accountName: string;
    accountAvatar: string;
    followerCount: number;
    overallScore: number;
    status: string;
    createdAt: string;
  }>;
  total: number;
}
```

---

## 八、前端设计

### 8.1 页面结构

```
/(dashboard)/
  competitor/
    page.tsx              — 主页面：URL 输入 + 历史列表
    [id]/
      page.tsx            — 分析报告详情页
```

### 8.2 主页面布局

```
┌──────────────────────────────────────────────────┐
│  同行对标分析                                      │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ 🔗 输入对标账号链接                              │ │
│  │ [                                          ] │ │
│  │ 支持抖音 · 小红书 · B站 · 快手                 │ │
│  │                            [开始分析]        │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  历史分析                                          │
│  ┌────┬──────────┬────────┬──────┬──────┬──────┐ │
│  │平台 │ 账号名称    │ 粉丝数   │ 综合分 │ 状态  │ 时间  │ │
│  ├────┼──────────┼────────┼──────┼──────┼──────┤ │
│  │抖音 │ @美食达人   │ 120.5w │ 82   │ 完成  │ 2h前 │ │
│  │小红书│ @护肤攻略   │ 45.2w  │ 76   │ 完成  │ 1d前 │ │
│  │抖音 │ @穿搭日记   │ 88.1w  │ --   │ 分析中│ 刚刚  │ │
│  └────┴──────────┴────────┴──────┴──────┴──────┘ │
└──────────────────────────────────────────────────┘
```

### 8.3 报告详情页布局

```
┌──────────────────────────────────────────────────┐
│  ← 返回    @美食达人 · 抖音 · 分析时间 2h前         │
├──────────────────────────────────────────────────┤
│                                                    │
│  ┌────────────────────┬────────────────────────┐ │
│  │                    │    Score Cards          │ │
│  │   Radar Chart      │    ┌──────┐ ┌──────┐   │ │
│  │   (6维雷达图)       │    │内容力 │ │涨粉力│   │ │
│  │                    │    │ 85   │ │ 72   │   │ │
│  │  综合评分: 82       │    └──────┘ └──────┘   │ │
│  │                    │    ┌──────┐ ┌──────┐   │ │
│  │                    │    │互动力 │ │变现力│   │ │
│  │                    │    │ 90   │ │ 68   │   │ │
│  │                    │    └──────┘ └──────┘   │ │
│  │                    │    ┌──────┐ ┌──────┐   │ │
│  │                    │    │人设力 │ │运营力│   │ │
│  │                    │    │ 88   │ │ 78   │   │ │
│  └────────────────────┴────────────────────────┘ │
│                                                    │
│  [账号定位] [内容策略] [增长分析] [互动分析]         │
│  [变现分析] [对标建议]                              │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ 当前 Tab 内容区                                 │ │
│  │ （各维度分析叙述 + 数据图表）                     │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  Top 10 视频排行                                   │
│  ┌──────────────────────────────────────────────┐ │
│  │ 封面 | 标题 | 播放 | 点赞 | 互动率 | 发布时间  │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  发布时间热力图                                     │
│  ┌──────────────────────────────────────────────┐ │
│  │ (星期 x 小时 heatmap)                          │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 8.4 关键 UI 组件

| 组件 | 来源 | 用途 |
|------|------|------|
| Card | shadcn/ui | 评分卡片 |
| Tabs | shadcn/ui | 报告分段切换 |
| Table | shadcn/ui | 视频排行 |
| Badge | shadcn/ui | 状态标签 |
| Progress | shadcn/ui | Pipeline 进度 |
| Input + Button | shadcn/ui | URL 输入 |
| 雷达图 | recharts (RadarChart) | 6维评分 |
| 热力图 | recharts (custom) | 发布时间 |

---

## 九、环境变量

```env
# TikHub API
TIKHUB_API_KEY=                     # TikHub Bearer Token
TIKHUB_BASE_URL=https://api.tikhub.io  # 海外服务器用此地址
# TIKHUB_BASE_URL=https://api.tikhub.dev  # 国内服务器用此地址
```

不需要 Apify 环境变量（MVP 阶段不使用），后续可选加入：
```env
# Apify (Phase 2 - 可选)
APIFY_TOKEN=                        # Apify API Token
```

---

## 十、文件结构

```
apps/web/src/
├── app/
│   ├── api/
│   │   └── competitor/
│   │       ├── analyze/
│   │       │   └── route.ts         # POST: 提交分析
│   │       ├── reports/
│   │       │   └── route.ts         # GET: 历史列表
│   │       └── [id]/
│   │           └── route.ts         # GET: 详情, DELETE: 删除
│   └── (dashboard)/
│       └── competitor/
│           ├── page.tsx             # 主页面
│           └── [id]/
│               └── page.tsx         # 报告详情
├── lib/
│   ├── tikhub/
│   │   ├── client.ts               # HTTP 客户端
│   │   ├── url-parser.ts           # 平台 URL 识别
│   │   ├── types.ts                # TikHub 响应类型
│   │   └── adapters/
│   │       ├── index.ts            # 适配器工厂
│   │       ├── types.ts            # NormalizedAccount/Video 接口
│   │       ├── douyin.ts           # 抖音适配器
│   │       ├── xiaohongshu.ts      # 小红书适配器
│   │       ├── bilibili.ts         # B站适配器 (Phase 2)
│   │       └── kuaishou.ts         # 快手适配器 (Phase 2)
│   └── competitor-analysis/
│       ├── pipeline.ts             # 核心 pipeline 编排
│       ├── analyzer.ts             # AI 分析（Claude prompt）
│       ├── metrics.ts              # 量化指标计算
│       └── types.ts                # 分析结果类型定义
└── components/
    └── competitor/
        ├── url-input.tsx           # URL 输入组件
        ├── analysis-list.tsx       # 历史列表
        ├── analysis-status.tsx     # 进度状态
        ├── radar-chart.tsx         # 6维雷达图
        ├── score-cards.tsx         # 评分卡片
        ├── report-tabs.tsx         # 报告分段
        ├── video-ranking.tsx       # Top 视频表格
        └── posting-heatmap.tsx     # 发布热力图
```

---

## 十一、实施计划

### Phase 1: MVP（预计 3-5 天）

| 步骤 | 内容 | 预计 |
|------|------|------|
| 1 | Prisma schema + migration | 0.5d |
| 2 | TikHub client + 抖音/小红书适配器 | 1d |
| 3 | Pipeline + 指标计算 + AI 分析 | 1d |
| 4 | API Routes (3个) | 0.5d |
| 5 | 前端页面 + 雷达图 | 1-1.5d |
| 6 | 联调测试 | 0.5d |

### Phase 2: 扩展平台

| 步骤 | 内容 |
|------|------|
| 1 | B站 + 快手适配器 |
| 2 | 星图 API 集成（抖音深度分析） |
| 3 | Apify 集成（评论深挖、转文字） |

### Phase 3: 高级功能

| 步骤 | 内容 |
|------|------|
| 1 | 多账号对比（雷达图叠加） |
| 2 | 定期监控（Cron 定时分析同一账号） |
| 3 | 与 IP Profile 联动（对标建议 → 创作指导） |
| 4 | 视频号支持（依赖新榜/友望 API） |

---

## 十二、风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| TikHub API 不稳定/限流 | 中 | 分析失败 | 重试 3 次 + 指数退避 + 失败状态提示用户 |
| 平台反爬导致数据不全 | 中 | 部分字段缺失 | 字段容错处理，报告标注"数据不完整" |
| AI 输出格式不符预期 | 低 | 渲染异常 | JSON Schema 校验 + fallback 默认结构 |
| 分析耗时过长(>2min) | 低 | 用户体验差 | 前端进度条 + 步骤状态 + 邮件通知(可选) |
| 视频号无法覆盖 | 高 | 功能缺失 | Phase 3 独立评估，先标注"暂不支持" |
| 合规风险 | 低 | 法律问题 | 仅用付费 API，不直接爬取，存聚合数据 |

---

## 十三、成本预算

### 月度运营成本（日均 50 次分析）

| 项目 | 月费 |
|------|------|
| TikHub API | ~$75-150 |
| Claude API（AI分析） | ~$90 |
| **总计** | **~$165-240/月** |

### 按次成本

| 项目 | 单次 |
|------|------|
| TikHub 数据采集 | ~$0.06-0.20 |
| Claude AI 分析 | ~$0.06 |
| **单次总计** | **~$0.12-0.26** |

MVP 阶段不需要 Apify，可显著降低成本。后续按需引入。
