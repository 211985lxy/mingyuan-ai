---
name: pexels
description: "Pexels API integration guide. Free stock photos and videos API — search photos/videos, curated/popular content, collections, photo/video resource structure, pagination, rate limits, attribution requirements, and best practices for ClipFlow integration."
category: Media API Integration
tags: [pexels, stock-photos, stock-videos, free-images, media-api, search, collections]
---

# Pexels API 完整集成指南

本 Skill 是 ClipFlow 与 Pexels API 对接的权威参考。涵盖全部 API 端点、资源结构、参数详解、分页机制、速率限制和生产级最佳实践。

**Base URL:** `https://api.pexels.com`
**认证方式:** `Authorization: {API_KEY}` (HTTP Header)
**内容许可:** 免费使用，无需标注来源（但推荐标注摄影师）
**官方文档:** https://www.pexels.com/api/documentation/

---

## 一、认证与速率限制

### 1.1 认证

所有请求必须在 HTTP Header 中携带 API Key：

```
Authorization: YOUR_API_KEY
```

API Key 通过 https://www.pexels.com/api/ 注册获取。

### 1.2 速率限制

| 限制类型 | 默认额度 |
|---------|---------|
| 每小时请求数 | 200 |
| 每月请求数 | 20,000 |

- 超限返回 HTTP `429 Too Many Requests`
- 响应头 `X-Ratelimit-Limit` 和 `X-Ratelimit-Remaining` 可用于监控配额
- 需要更高额度需向 Pexels 申请并展示正确的署名用法

### 1.3 使用规则

- 免费用于商业和非商业用途
- **推荐**标注摄影师姓名和 Pexels 链接（非强制）
- 禁止出售未修改的照片/视频
- 禁止暗示照片中的人物为产品代言
- 不可将照片/视频作为独立文件再分发

---

## 二、API 端点全景图

### 2.1 照片端点

| # | 方法 | 路径 | 用途 |
|---|------|------|------|
| 1 | GET | `/v1/search` | 搜索照片 |
| 2 | GET | `/v1/curated` | 精选照片（每小时更新） |
| 3 | GET | `/v1/photos/{id}` | 获取单张照片详情 |

### 2.2 视频端点

| # | 方法 | 路径 | 用途 |
|---|------|------|------|
| 4 | GET | `/videos/search` | 搜索视频 |
| 5 | GET | `/videos/popular` | 热门视频 |
| 6 | GET | `/videos/videos/{id}` | 获取单个视频详情 |

### 2.3 收藏集端点

| # | 方法 | 路径 | 用途 |
|---|------|------|------|
| 7 | GET | `/v1/collections/featured` | 精选收藏集列表 |
| 8 | GET | `/v1/collections` | 我的收藏集列表 |
| 9 | GET | `/v1/collections/{id}` | 收藏集内媒体内容 |

---

## 三、照片端点详解

### 3.1 搜索照片 — `GET /v1/search`

最常用的端点，按关键词搜索照片。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | **是** | — | 搜索关键词 (如 "ocean", "nature") |
| `orientation` | string | 否 | — | 方向筛选: `landscape`, `portrait`, `square` |
| `size` | string | 否 | — | 最小尺寸: `large` (24MP), `medium` (12MP), `small` (4MP) |
| `color` | string | 否 | — | 颜色筛选: `red`, `orange`, `yellow`, `green`, `turquoise`, `blue`, `violet`, `pink`, `brown`, `black`, `gray`, `white` 或十六进制色值 (如 `#ffffff`) |
| `locale` | string | 否 | `en-US` | 搜索语言区域 |
| `page` | integer | 否 | 1 | 页码 |
| `per_page` | integer | 否 | 15 | 每页数量 (最大 80) |

**支持的 locale 值：**
`en-US`, `pt-BR`, `es-ES`, `ca-ES`, `de-DE`, `it-IT`, `fr-FR`, `sv-SE`, `id-ID`, `pl-PL`, `ja-JP`, `zh-TW`, `zh-CN`, `ko-KR`, `th-TH`, `nl-NL`, `hu-HU`, `vi-VN`, `cs-CZ`, `da-DK`, `fi-FI`, `uk-UA`, `el-GR`, `ro-RO`, `nb-NO`, `sk-SK`, `tr-TR`, `ru-RU`

**请求示例：**

```bash
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/v1/search?query=nature&orientation=landscape&size=large&per_page=5&page=1"
```

**响应结构：**

```json
{
  "total_results": 10000,
  "page": 1,
  "per_page": 5,
  "photos": [
    { /* Photo Resource */ }
  ],
  "next_page": "https://api.pexels.com/v1/search?query=nature&page=2&per_page=5"
}
```

### 3.2 精选照片 — `GET /v1/curated`

获取 Pexels 团队精选的照片，每小时至少更新一张。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | integer | 否 | 1 | 页码 |
| `per_page` | integer | 否 | 15 | 每页数量 (最大 80) |

**请求示例：**

```bash
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/v1/curated?per_page=10"
```

### 3.3 获取单张照片 — `GET /v1/photos/{id}`

通过 ID 获取照片详情。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | integer | **是** | 照片 ID (URL 路径参数) |

**请求示例：**

```bash
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/v1/photos/2014422"
```

---

## 四、视频端点详解

### 4.1 搜索视频 — `GET /videos/search`

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | **是** | — | 搜索关键词 |
| `orientation` | string | 否 | — | 方向: `landscape`, `portrait`, `square` |
| `size` | string | 否 | — | 尺寸: `large`, `medium`, `small` |
| `locale` | string | 否 | `en-US` | 搜索语言区域 |
| `page` | integer | 否 | 1 | 页码 |
| `per_page` | integer | 否 | 15 | 每页数量 (最大 80) |

**请求示例：**

```bash
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/videos/search?query=ocean&per_page=5"
```

**响应结构：**

```json
{
  "total_results": 5000,
  "page": 1,
  "per_page": 5,
  "videos": [
    { /* Video Resource */ }
  ],
  "next_page": "https://api.pexels.com/videos/search?query=ocean&page=2&per_page=5"
}
```

### 4.2 热门视频 — `GET /videos/popular`

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `min_width` | integer | 否 | — | 最小宽度 (像素) |
| `min_height` | integer | 否 | — | 最小高度 (像素) |
| `min_duration` | integer | 否 | — | 最短时长 (秒) |
| `max_duration` | integer | 否 | — | 最长时长 (秒) |
| `page` | integer | 否 | 1 | 页码 |
| `per_page` | integer | 否 | 15 | 每页数量 (最大 80) |

**请求示例：**

```bash
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/videos/popular?min_duration=10&max_duration=60&per_page=5"
```

### 4.3 获取单个视频 — `GET /videos/videos/{id}`

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | integer | **是** | 视频 ID (URL 路径参数) |

**请求示例：**

```bash
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/videos/videos/2499611"
```

---

## 五、收藏集端点详解

### 5.1 精选收藏集 — `GET /v1/collections/featured`

获取 Pexels 精选的公共收藏集。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | integer | 否 | 1 | 页码 |
| `per_page` | integer | 否 | 15 | 每页数量 (最大 80) |

### 5.2 我的收藏集 — `GET /v1/collections`

获取当前 API Key 所属账户的收藏集。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | integer | 否 | 1 | 页码 |
| `per_page` | integer | 否 | 15 | 每页数量 (最大 80) |

### 5.3 收藏集内容 — `GET /v1/collections/{id}`

获取指定收藏集中的媒体资源。

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | string | **是** | — | 收藏集 ID (URL 路径参数) |
| `type` | string | 否 | — | 筛选类型: `photos`, `videos` (不填返回全部) |
| `sort` | string | 否 | — | 排序: `asc`, `desc` |
| `page` | integer | 否 | 1 | 页码 |
| `per_page` | integer | 否 | 15 | 每页数量 (最大 80) |

---

## 六、资源数据结构

### 6.1 Photo 资源

```typescript
interface PexelsPhoto {
  id: number;                    // 照片唯一 ID
  width: number;                 // 原始宽度 (像素)
  height: number;                // 原始高度 (像素)
  url: string;                   // Pexels 网页链接
  photographer: string;          // 摄影师姓名
  photographer_url: string;      // 摄影师 Pexels 主页
  photographer_id: number;       // 摄影师 ID
  avg_color: string;             // 平均颜色 (十六进制, 如 "#978E82")
  src: PhotoSrc;                 // 不同尺寸的图片 URL
  liked: boolean;                // 是否已收藏
  alt: string;                   // 替代文字描述
}

interface PhotoSrc {
  original: string;  // 原始尺寸 (可能非常大)
  large2x: string;   // W 940px, H 按比例 (2x)
  large: string;     // W 940px, H 按比例
  medium: string;    // W 350px, H 按比例 (适合缩略图)
  small: string;     // W 130px, H 按比例
  portrait: string;  // W 800px, H 1200px (裁切)
  landscape: string; // W 1200px, H 627px (裁切)
  tiny: string;      // W 280px, H 200px (裁切)
}
```

**Photo 响应示例：**

```json
{
  "id": 2014422,
  "width": 3024,
  "height": 3024,
  "url": "https://www.pexels.com/photo/brown-rocks-during-golden-hour-2014422/",
  "photographer": "Joey Farina",
  "photographer_url": "https://www.pexels.com/@joey",
  "photographer_id": 680589,
  "avg_color": "#978E82",
  "src": {
    "original": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg",
    "large2x": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "large": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    "medium": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=350",
    "small": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=130",
    "portrait": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800",
    "landscape": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    "tiny": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280"
  },
  "liked": false,
  "alt": "Brown Rocks During Golden Hour"
}
```

### 6.2 Video 资源

```typescript
interface PexelsVideo {
  id: number;                        // 视频唯一 ID
  width: number;                     // 原始宽度 (像素)
  height: number;                    // 原始高度 (像素)
  url: string;                       // Pexels 网页链接
  image: string;                     // 视频封面图 URL
  duration: number;                  // 时长 (秒)
  user: VideoUser;                   // 作者信息
  video_files: VideoFile[];          // 不同质量的视频文件
  video_pictures: VideoPicture[];    // 视频预览缩略图
}

interface VideoUser {
  id: number;
  name: string;
  url: string;
}

interface VideoFile {
  id: number;
  quality: string;       // "hd", "sd", "hls"
  file_type: string;     // "video/mp4" 等
  width: number;
  height: number;
  fps: number;           // 帧率
  link: string;          // 下载 URL
}

interface VideoPicture {
  id: number;
  picture: string;       // 缩略图 URL
  nr: number;            // 序号 (0-based)
}
```

### 6.3 Collection 资源

```typescript
interface PexelsCollection {
  id: string;
  title: string;
  description: string;
  private: boolean;
  media_count: number;
  photos_count: number;
  videos_count: number;
}
```

### 6.4 分页响应结构

所有列表端点返回统一的分页结构：

```typescript
interface PaginatedResponse<T> {
  page: number;               // 当前页码
  per_page: number;           // 每页数量
  total_results: number;      // 总结果数
  next_page?: string;         // 下一页完整 URL (无下一页时不返回)
  prev_page?: string;         // 上一页完整 URL (第一页时不返回)
  photos?: T[];               // 照片端点
  videos?: T[];               // 视频端点
  collections?: T[];          // 收藏集端点
  media?: T[];                // 收藏集内容端点
}
```

---

## 七、ClipFlow 集成最佳实践

### 7.1 典型使用场景

| 场景 | 推荐端点 | 说明 |
|------|---------|------|
| 视频生成素材采集 | `GET /v1/search` + `GET /videos/search` | 根据脚本关键词搜索配图/配视频素材 |
| 首页灵感推荐 | `GET /v1/curated` + `GET /videos/popular` | 展示精选/热门内容 |
| 封面图选择 | `GET /v1/search` | 搜索与视频主题匹配的封面 |
| 素材库浏览 | `GET /v1/collections/featured` | 按主题收藏集浏览 |

### 7.2 TypeScript 客户端示例

```typescript
const PEXELS_BASE_URL = "https://api.pexels.com";

async function pexelsFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, PEXELS_BASE_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: process.env.PEXELS_API_KEY! },
  });

  if (res.status === 429) {
    throw new Error("Pexels API rate limit exceeded");
  }
  if (!res.ok) {
    throw new Error(`Pexels API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// 搜索照片
async function searchPhotos(query: string, options?: {
  orientation?: "landscape" | "portrait" | "square";
  size?: "large" | "medium" | "small";
  color?: string;
  locale?: string;
  page?: number;
  per_page?: number;
}) {
  const params: Record<string, string> = { query };
  if (options?.orientation) params.orientation = options.orientation;
  if (options?.size) params.size = options.size;
  if (options?.color) params.color = options.color;
  if (options?.locale) params.locale = options.locale;
  if (options?.page) params.page = String(options.page);
  if (options?.per_page) params.per_page = String(options.per_page);

  return pexelsFetch<PexelsPhotoSearchResponse>("/v1/search", params);
}

// 搜索视频
async function searchVideos(query: string, options?: {
  orientation?: "landscape" | "portrait" | "square";
  size?: "large" | "medium" | "small";
  locale?: string;
  page?: number;
  per_page?: number;
}) {
  const params: Record<string, string> = { query };
  if (options?.orientation) params.orientation = options.orientation;
  if (options?.size) params.size = options.size;
  if (options?.locale) params.locale = options.locale;
  if (options?.page) params.page = String(options.page);
  if (options?.per_page) params.per_page = String(options.per_page);

  return pexelsFetch<PexelsVideoSearchResponse>("/videos/search", params);
}

// 获取单张照片
async function getPhoto(id: number) {
  return pexelsFetch<PexelsPhoto>(`/v1/photos/${id}`);
}

// 获取单个视频
async function getVideo(id: number) {
  return pexelsFetch<PexelsVideo>(`/videos/videos/${id}`);
}

// 精选照片
async function getCuratedPhotos(page = 1, per_page = 15) {
  return pexelsFetch<PexelsPhotoSearchResponse>("/v1/curated", {
    page: String(page),
    per_page: String(per_page),
  });
}

// 热门视频
async function getPopularVideos(options?: {
  min_width?: number;
  min_height?: number;
  min_duration?: number;
  max_duration?: number;
  page?: number;
  per_page?: number;
}) {
  const params: Record<string, string> = {};
  if (options?.min_width) params.min_width = String(options.min_width);
  if (options?.min_height) params.min_height = String(options.min_height);
  if (options?.min_duration) params.min_duration = String(options.min_duration);
  if (options?.max_duration) params.max_duration = String(options.max_duration);
  if (options?.page) params.page = String(options.page);
  if (options?.per_page) params.per_page = String(options.per_page);

  return pexelsFetch<PexelsVideoSearchResponse>("/videos/popular", params);
}
```

### 7.3 图片尺寸选择指南

| 用途 | 推荐 src 字段 | 尺寸 |
|------|-------------|------|
| 视频素材 (高质量) | `original` | 原始尺寸 |
| 页面展示 (大图) | `large` 或 `large2x` | W 940px |
| 列表缩略图 | `medium` | W 350px |
| 网格瀑布流 | `small` 或 `tiny` | W 130-280px |
| 竖屏封面 | `portrait` | 800x1200 |
| 横屏封面 | `landscape` | 1200x627 |
| 占位/预加载 | `tiny` | 280x200 |

### 7.4 视频文件选择

`video_files` 数组包含多种质量，按需选择：

```typescript
function selectVideoFile(video: PexelsVideo, preferHD = true): VideoFile | undefined {
  const files = video.video_files;
  if (preferHD) {
    return files.find(f => f.quality === "hd" && f.file_type === "video/mp4")
      ?? files.find(f => f.quality === "sd" && f.file_type === "video/mp4");
  }
  return files.find(f => f.quality === "sd" && f.file_type === "video/mp4")
    ?? files[0];
}
```

### 7.5 开发注意事项

1. **速率限制:** 默认 200 次/小时，缓存搜索结果避免重复请求
2. **分页上限:** `per_page` 最大 80，超过无效
3. **图片 URL 稳定性:** `src` 中的 URL 是持久化的，可安全存储
4. **视频文件 URL:** `video_files[].link` 也是持久化的
5. **avg_color:** 可用于图片加载前的占位色
6. **alt 文字:** 可用于 SEO 和无障碍访问
7. **搜索建议:** 使用英文关键词获得最佳结果，`locale` 参数影响搜索结果排序
8. **CORS:** Pexels API 支持跨域请求，但建议通过后端代理调用以保护 API Key

### 7.6 环境变量

```env
PEXELS_API_KEY=          # Pexels API 密钥
```
