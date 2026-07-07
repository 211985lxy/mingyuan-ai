---
name: pixabay
description: "Pixabay API integration guide. Free stock photos, illustrations, vectors, and videos API — search images/videos, category filtering, color filtering, Editor's Choice, resource structure, pagination, rate limits, hotlinking policy, and best practices for ClipFlow integration."
category: Media API Integration
tags: [pixabay, stock-photos, stock-videos, stock-illustrations, vectors, free-images, media-api, search]
---

# Pixabay API 完整集成指南

本 Skill 是 ClipFlow 与 Pixabay API 对接的权威参考。涵盖全部 API 端点、资源结构、参数详解、分页机制、速率限制和生产级最佳实践。

**Base URL (图片):** `https://pixabay.com/api/`
**Base URL (视频):** `https://pixabay.com/api/videos/`
**认证方式:** URL 查询参数 `key={API_KEY}`
**响应格式:** JSON，UTF-8 编码
**内容许可:** Pixabay Content License — 免费用于商业和非商业用途，无需标注来源（但推荐标注）
**官方文档:** https://pixabay.com/api/docs/

---

## 一、认证与速率限制

### 1.1 认证

所有请求必须通过 URL 查询参数携带 API Key：

```
https://pixabay.com/api/?key=YOUR_API_KEY&q=yellow+flowers
```

API Key 通过 https://pixabay.com/api/docs/ 登录后获取。

### 1.2 速率限制

| 限制类型 | 默认额度 |
|---------|---------|
| 每分钟请求数 | 100 |

**响应头：**

| Header | 说明 |
|--------|------|
| `X-RateLimit-Limit` | 当前 60 秒窗口允许的最大请求数 |
| `X-RateLimit-Remaining` | 当前窗口剩余请求数 |
| `X-RateLimit-Reset` | 窗口重置倒计时 (秒) |

- 超限返回 HTTP `429 Too Many Requests`
- **请求必须缓存 24 小时**
- 系统性批量下载被禁止
- 可通过联系 Pixabay 申请提高限额

### 1.3 使用规则

- 免费用于商业和非商业用途
- **推荐**在展示搜索结果时标注内容来源（Pixabay）
- **禁止**永久使用 Pixabay 返回的图片 URL 进行热链接 (hotlinking)
- 必须将图片下载到自有服务器后使用
- 视频可嵌入但建议存储到自有服务器
- API 仅供真实用户请求使用，不得用于自动化批量采集

---

## 二、API 端点全景图

| # | 方法 | Base URL | 用途 |
|---|------|----------|------|
| 1 | GET | `https://pixabay.com/api/` | 搜索图片 (照片/插画/矢量图) |
| 2 | GET | `https://pixabay.com/api/videos/` | 搜索视频 |

> Pixabay API 结构比 Pexels 更精简，只有两个端点，但参数丰富度更高。通过 `id` 参数可实现单资源查询。

---

## 三、搜索图片端点详解

### 3.1 搜索图片 — `GET https://pixabay.com/api/`

最核心的端点，支持关键词搜索、类型/方向/颜色/分类多维过滤。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `key` | string | **是** | — | API Key |
| `q` | string | 否 | 全部图片 | URL 编码搜索词，最长 100 字符 |
| `lang` | string | 否 | `en` | 搜索语言 (ISO 639-1)，见下方语言列表 |
| `id` | string | 否 | — | 按 ID 精确获取单张图片 |
| `image_type` | string | 否 | `all` | 图片类型: `all`, `photo`, `illustration`, `vector` |
| `orientation` | string | 否 | `all` | 方向: `all`, `horizontal`, `vertical` |
| `category` | string | 否 | — | 分类过滤，见下方分类列表 |
| `min_width` | integer | 否 | 0 | 最小宽度 (像素) |
| `min_height` | integer | 否 | 0 | 最小高度 (像素) |
| `colors` | string | 否 | — | 颜色过滤 (逗号分隔)，见下方颜色列表 |
| `editors_choice` | boolean | 否 | `false` | 仅返回编辑精选 |
| `safesearch` | boolean | 否 | `false` | 安全搜索 (适合全年龄) |
| `order` | string | 否 | `popular` | 排序: `popular`, `latest` |
| `page` | integer | 否 | 1 | 页码 |
| `per_page` | integer | 否 | 20 | 每页数量 (3-200) |
| `callback` | string | 否 | — | JSONP 回调函数名 |
| `pretty` | boolean | 否 | `false` | 格式化 JSON (仅调试用) |

**支持的语言 (`lang`)：**
`cs`, `da`, `de`, `en`, `es`, `fr`, `id`, `it`, `hu`, `nl`, `no`, `pl`, `pt`, `ro`, `sk`, `fi`, `sv`, `tr`, `vi`, `th`, `bg`, `ru`, `el`, `ja`, `ko`, `zh`

**支持的分类 (`category`)：**
`backgrounds`, `fashion`, `nature`, `science`, `education`, `feelings`, `health`, `people`, `religion`, `places`, `animals`, `industry`, `computer`, `food`, `sports`, `transportation`, `travel`, `buildings`, `business`, `music`

**支持的颜色 (`colors`)：**
`grayscale`, `transparent`, `red`, `orange`, `yellow`, `green`, `turquoise`, `blue`, `lilac`, `pink`, `white`, `gray`, `black`, `brown`

**请求示例：**

```bash
# 搜索横向自然照片
curl "https://pixabay.com/api/?key=YOUR_API_KEY&q=nature&image_type=photo&orientation=horizontal&per_page=5"

# 按 ID 获取单张图片
curl "https://pixabay.com/api/?key=YOUR_API_KEY&id=195893"

# 搜索蓝色矢量图
curl "https://pixabay.com/api/?key=YOUR_API_KEY&q=logo&image_type=vector&colors=blue"

# 编辑精选 + 安全搜索
curl "https://pixabay.com/api/?key=YOUR_API_KEY&editors_choice=true&safesearch=true&category=nature"
```

**响应结构：**

```json
{
  "total": 4692,
  "totalHits": 500,
  "hits": [
    { /* Image Resource */ }
  ]
}
```

> **注意：** `totalHits` 上限 500，表示单次查询最多可访问 500 张图片。

---

## 四、搜索视频端点详解

### 4.1 搜索视频 — `GET https://pixabay.com/api/videos/`

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `key` | string | **是** | — | API Key |
| `q` | string | 否 | 全部视频 | URL 编码搜索词，最长 100 字符 |
| `lang` | string | 否 | `en` | 搜索语言 (同图片端点) |
| `id` | string | 否 | — | 按 ID 精确获取单个视频 |
| `video_type` | string | 否 | `all` | 视频类型: `all`, `film`, `animation` |
| `category` | string | 否 | — | 分类过滤 (同图片端点) |
| `min_width` | integer | 否 | 0 | 最小宽度 (像素) |
| `min_height` | integer | 否 | 0 | 最小高度 (像素) |
| `editors_choice` | boolean | 否 | `false` | 仅返回编辑精选 |
| `safesearch` | boolean | 否 | `false` | 安全搜索 |
| `order` | string | 否 | `popular` | 排序: `popular`, `latest` |
| `page` | integer | 否 | 1 | 页码 |
| `per_page` | integer | 否 | 20 | 每页数量 (3-200) |
| `callback` | string | 否 | — | JSONP 回调函数名 |
| `pretty` | boolean | 否 | `false` | 格式化 JSON |

> 视频端点没有 `orientation` 和 `colors` 参数（与图片端点不同）。

**请求示例：**

```bash
# 搜索自然类视频
curl "https://pixabay.com/api/videos/?key=YOUR_API_KEY&q=nature&per_page=5"

# 按 ID 获取单个视频
curl "https://pixabay.com/api/videos/?key=YOUR_API_KEY&id=125"

# 搜索动画类型
curl "https://pixabay.com/api/videos/?key=YOUR_API_KEY&q=abstract&video_type=animation"
```

**响应结构：**

```json
{
  "total": 510,
  "totalHits": 500,
  "hits": [
    { /* Video Resource */ }
  ]
}
```

---

## 五、资源数据结构

### 5.1 Image 资源

```typescript
interface PixabayImage {
  id: number;                    // 图片唯一 ID
  pageURL: string;               // Pixabay 网页链接 (含下载按钮)
  type: string;                  // "photo", "illustration", "vector"
  tags: string;                  // 逗号分隔的标签
  previewURL: string;            // 低分辨率预览 (最大 150px 宽/高)
  previewWidth: number;          // 预览图宽度
  previewHeight: number;         // 预览图高度
  webformatURL: string;          // 中等尺寸 (最大 640px)，24 小时有效
  webformatWidth: number;        // webformat 宽度
  webformatHeight: number;       // webformat 高度
  largeImageURL: string;         // 缩放版 (最大 1280px 长边)
  views: number;                 // 浏览次数
  downloads: number;             // 下载次数
  likes: number;                 // 点赞数
  comments: number;              // 评论数
  user_id: number;               // 贡献者 ID
  user: string;                  // 贡献者用户名
  userImageURL: string;          // 贡献者头像 (250x250)
  // --- 以下仅高级/付费账户可用 ---
  fullHDURL?: string;            // 全高清 (最大 1920px 长边)
  imageURL?: string;             // 原始分辨率
  vectorURL?: string;            // SVG/AI 矢量文件 (仅矢量图有)
}
```

**webformatURL 尺寸变体：**
将 URL 中的 `_640` 替换可获取不同尺寸：
- `_180` — 180px
- `_340` — 340px
- `_640` — 640px (默认)
- `_960` — 960px

**Image 响应示例：**

```json
{
  "id": 195893,
  "pageURL": "https://pixabay.com/photos/blossom-bloom-flower-195893/",
  "type": "photo",
  "tags": "blossom, bloom, flower",
  "previewURL": "https://cdn.pixabay.com/photo/2013/10/15/09/12/flower-195893_150.jpg",
  "previewWidth": 150,
  "previewHeight": 84,
  "webformatURL": "https://pixabay.com/get/xxxxx_640.jpg",
  "webformatWidth": 640,
  "webformatHeight": 360,
  "largeImageURL": "https://pixabay.com/get/xxxxx_1280.jpg",
  "views": 603627,
  "downloads": 69540,
  "likes": 1010,
  "comments": 142,
  "user_id": 48777,
  "user": "Josch13",
  "userImageURL": "https://cdn.pixabay.com/user/2013/11/05/02-10-23-764_250x250.jpg"
}
```

### 5.2 Video 资源

```typescript
interface PixabayVideo {
  id: number;                        // 视频唯一 ID
  pageURL: string;                   // Pixabay 网页链接
  type: string;                      // "film" 或 "animation"
  tags: string;                      // 逗号分隔的标签
  duration: number;                  // 时长 (秒)
  videos: {                          // 不同尺寸的视频文件
    large: PixabayVideoSize;         // 3840x2160 (可能为空)
    medium: PixabayVideoSize;        // 1920x1080 (旧视频为 1280x720)
    small: PixabayVideoSize;         // 1280x720 (旧视频为 960x540)
    tiny: PixabayVideoSize;          // 960x540 (旧视频为 640x360)
  };
  views: number;                     // 浏览次数
  downloads: number;                 // 下载次数
  likes: number;                     // 点赞数
  comments: number;                  // 评论数
  user_id: number;                   // 贡献者 ID
  user: string;                      // 贡献者用户名
  userImageURL: string;              // 贡献者头像
}

interface PixabayVideoSize {
  url: string;                       // 视频 URL (追加 ?download=1 触发浏览器下载)
  width: number;                     // 宽度
  height: number;                    // 高度
  size: number;                      // 文件大小 (字节，近似值)
  thumbnail: string;                 // 海报缩略图 URL
}
```

**视频尺寸规格：**

| 尺寸 | 分辨率 | 备注 |
|------|--------|------|
| `large` | 3840x2160 (4K) | 部分视频可能为空 |
| `medium` | 1920x1080 (1080p) | 旧视频为 1280x720 |
| `small` | 1280x720 (720p) | 旧视频为 960x540 |
| `tiny` | 960x540 (540p) | 旧视频为 640x360 |

**Video 响应示例：**

```json
{
  "id": 125,
  "pageURL": "https://pixabay.com/videos/flowers-yellow-petals-125/",
  "type": "film",
  "tags": "flowers, yellow, petals",
  "duration": 12,
  "videos": {
    "large": { "url": "https://cdn.pixabay.com/video/...", "width": 3840, "height": 2160, "size": 6615235, "thumbnail": "https://..." },
    "medium": { "url": "https://cdn.pixabay.com/video/...", "width": 1920, "height": 1080, "size": 3562083, "thumbnail": "https://..." },
    "small": { "url": "https://cdn.pixabay.com/video/...", "width": 1280, "height": 720, "size": 1030123, "thumbnail": "https://..." },
    "tiny": { "url": "https://cdn.pixabay.com/video/...", "width": 960, "height": 540, "size": 524689, "thumbnail": "https://..." }
  },
  "views": 169,
  "downloads": 86,
  "likes": 14,
  "comments": 2,
  "user_id": 1281706,
  "user": "Coverr-Free-Footage",
  "userImageURL": "https://cdn.pixabay.com/user/..."
}
```

### 5.3 分页与结果限制

```typescript
interface PixabaySearchResponse<T> {
  total: number;          // 总命中数
  totalHits: number;      // 可访问的最大数量 (上限 500)
  hits: T[];              // 结果数组
}
```

- `total` 是实际匹配总数
- `totalHits` 上限 500 — 即使 `total` 大于 500，单次搜索最多翻页获取 500 条
- 分页通过 `page` + `per_page` 控制，`per_page` 范围 3-200

---

## 六、Pixabay vs Pexels 对比

| 维度 | Pixabay | Pexels |
|------|---------|--------|
| 认证方式 | URL 参数 `key=` | HTTP Header `Authorization:` |
| 图片端点 | 1 个 (含搜索+按 ID) | 3 个 (搜索/精选/按 ID) |
| 视频端点 | 1 个 (含搜索+按 ID) | 3 个 (搜索/热门/按 ID) |
| 图片类型 | photo + illustration + vector | 仅 photo |
| 颜色过滤 | 支持 14 种预定义颜色 | 支持 12 种 + 十六进制色值 |
| 分类过滤 | 20 个预定义分类 | 不支持 |
| 编辑精选 | `editors_choice=true` | 不支持 |
| 速率限制 | 100 次/分钟 | 200 次/小时 |
| 每页最大 | 200 | 80 |
| 结果上限 | 500 (totalHits) | 无硬性上限 |
| 视频尺寸结构 | 对象 `{large, medium, small, tiny}` | 数组 `video_files[]` |
| 热链接 | 禁止永久热链接 | 禁止永久热链接 |
| 收藏集 API | 不支持 | 支持 |

---

## 七、ClipFlow 集成最佳实践

### 7.1 典型使用场景

| 场景 | 推荐方式 | 说明 |
|------|---------|------|
| 视频素材采集 | 视频搜索 + 图片搜索 | 根据脚本关键词搜索素材 |
| 插画/矢量素材 | 图片搜索 `image_type=illustration/vector` | Pixabay 独有的插画和矢量资源 |
| 按主题分类浏览 | `category` 参数 | 20 个预定义分类比纯关键词更精准 |
| 高质量精选 | `editors_choice=true` | 编辑精选质量更高 |
| 背景图片 | `category=backgrounds` | 专门的背景分类 |
| 安全内容 | `safesearch=true` | 确保内容适合全年龄 |

### 7.2 TypeScript 客户端示例

```typescript
const PIXABAY_API_URL_IMAGES = "https://pixabay.com/api/";
const PIXABAY_API_URL_VIDEOS = "https://pixabay.com/api/videos/";

async function pixabayFetch<T>(baseUrl: string, params: Record<string, string>): Promise<T> {
  const url = new URL(baseUrl);
  url.searchParams.set("key", process.env.PIXABAY_API_KEY!);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());

  if (res.status === 429) {
    const reset = res.headers.get("X-RateLimit-Reset");
    throw new Error(`Pixabay API rate limit exceeded. Resets in ${reset}s`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pixabay API error: ${res.status} — ${body}`);
  }

  return res.json();
}

// 搜索图片
async function searchImages(query: string, options?: {
  lang?: string;
  image_type?: "all" | "photo" | "illustration" | "vector";
  orientation?: "all" | "horizontal" | "vertical";
  category?: string;
  min_width?: number;
  min_height?: number;
  colors?: string;
  editors_choice?: boolean;
  safesearch?: boolean;
  order?: "popular" | "latest";
  page?: number;
  per_page?: number;
}) {
  const params: Record<string, string> = {};
  if (query) params.q = query;
  if (options?.lang) params.lang = options.lang;
  if (options?.image_type) params.image_type = options.image_type;
  if (options?.orientation) params.orientation = options.orientation;
  if (options?.category) params.category = options.category;
  if (options?.min_width) params.min_width = String(options.min_width);
  if (options?.min_height) params.min_height = String(options.min_height);
  if (options?.colors) params.colors = options.colors;
  if (options?.editors_choice) params.editors_choice = "true";
  if (options?.safesearch) params.safesearch = "true";
  if (options?.order) params.order = options.order;
  if (options?.page) params.page = String(options.page);
  if (options?.per_page) params.per_page = String(options.per_page);

  return pixabayFetch<PixabaySearchResponse<PixabayImage>>(PIXABAY_API_URL_IMAGES, params);
}

// 按 ID 获取单张图片
async function getImage(id: number) {
  return pixabayFetch<PixabaySearchResponse<PixabayImage>>(PIXABAY_API_URL_IMAGES, {
    id: String(id),
  });
}

// 搜索视频
async function searchVideos(query: string, options?: {
  lang?: string;
  video_type?: "all" | "film" | "animation";
  category?: string;
  min_width?: number;
  min_height?: number;
  editors_choice?: boolean;
  safesearch?: boolean;
  order?: "popular" | "latest";
  page?: number;
  per_page?: number;
}) {
  const params: Record<string, string> = {};
  if (query) params.q = query;
  if (options?.lang) params.lang = options.lang;
  if (options?.video_type) params.video_type = options.video_type;
  if (options?.category) params.category = options.category;
  if (options?.min_width) params.min_width = String(options.min_width);
  if (options?.min_height) params.min_height = String(options.min_height);
  if (options?.editors_choice) params.editors_choice = "true";
  if (options?.safesearch) params.safesearch = "true";
  if (options?.order) params.order = options.order;
  if (options?.page) params.page = String(options.page);
  if (options?.per_page) params.per_page = String(options.per_page);

  return pixabayFetch<PixabaySearchResponse<PixabayVideo>>(PIXABAY_API_URL_VIDEOS, params);
}

// 按 ID 获取单个视频
async function getVideo(id: number) {
  return pixabayFetch<PixabaySearchResponse<PixabayVideo>>(PIXABAY_API_URL_VIDEOS, {
    id: String(id),
  });
}
```

### 7.3 图片尺寸选择指南

| 用途 | 推荐字段 | 尺寸 | 备注 |
|------|---------|------|------|
| 视频素材 (高质量) | `largeImageURL` | 最大 1280px | 免费账户最大尺寸 |
| 页面展示 (中等) | `webformatURL` (_960) | 960px | 替换 URL 中的 _640 |
| 列表缩略图 | `webformatURL` (_340) | 340px | |
| 网格瀑布流 | `previewURL` | 最大 150px | |
| 占位/预加载 | `previewURL` | 最大 150px | 最小尺寸 |

> **重要：** `webformatURL` 仅 24 小时有效，需下载到自有服务器。`largeImageURL` 和 `previewURL` 同理，禁止永久热链接。

### 7.4 视频文件选择

```typescript
function selectPixabayVideo(video: PixabayVideo, prefer: "large" | "medium" | "small" | "tiny" = "medium"): PixabayVideoSize | undefined {
  const sizes: Array<"large" | "medium" | "small" | "tiny"> = ["large", "medium", "small", "tiny"];
  const startIdx = sizes.indexOf(prefer);

  // 从首选尺寸开始向下降级
  for (let i = startIdx; i < sizes.length; i++) {
    const size = video.videos[sizes[i]];
    if (size && size.url) return size;
  }

  return undefined;
}
```

> **注意：** `large` (4K) 可能返回空对象。选择时需做降级处理。

### 7.5 与 Pexels 联合使用策略

ClipFlow 同时集成了 Pexels 和 Pixabay，建议按以下策略分配：

| 需求 | 优先使用 | 原因 |
|------|---------|------|
| 高质量照片 | Pexels | 照片质量普遍更高 |
| 插画/矢量素材 | **Pixabay** | Pexels 不支持 |
| 按分类浏览 | **Pixabay** | 20 个内置分类 |
| 精选内容推荐 | 两者皆可 | Pexels: curated / Pixabay: editors_choice |
| 视频素材 | 两者并行搜索 | 聚合结果选择最佳素材 |
| 搜索结果扩充 | 两者并行搜索 | 不同素材库互补 |

### 7.6 开发注意事项

1. **热链接禁止：** 所有 URL 仅供临时展示搜索结果，必须下载到 OSS 后使用
2. **webformatURL 有效期：** 仅 24 小时，不可持久化存储
3. **totalHits 上限 500：** 不要期望翻页超过 500 条，必要时调整搜索词
4. **视频 large 可能为空：** 4K 并非所有视频都有，需降级处理
5. **API Key 在 URL 中：** 不要在前端暴露，必须通过后端代理调用
6. **缓存要求：** 官方要求缓存搜索结果 24 小时
7. **搜索建议：** 使用英文关键词效果最佳，`lang` 参数影响搜索结果
8. **per_page 范围：** 3-200，比 Pexels 的 80 上限更大，可减少分页请求

### 7.7 错误处理

| HTTP 状态码 | 含义 | 处理方式 |
|------------|------|---------|
| 200 | 成功 | 正常解析 JSON |
| 400 | 请求参数错误 | 检查参数合法性 |
| 401 | API Key 无效 | 检查 key 参数 |
| 429 | 超出速率限制 | 读取 `X-RateLimit-Reset`，等待后重试 |

错误响应体为纯文本描述。

### 7.8 环境变量

```env
PIXABAY_API_KEY=          # Pixabay API 密钥
```
