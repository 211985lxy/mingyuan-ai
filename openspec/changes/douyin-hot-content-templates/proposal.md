## Why

ClipFlow 的目标用户是营销小白，他们最大的痛点不是视频制作本身，而是"不知道拍什么"。当前 MVP 的脚本系统仅提供 AI 生成，但缺少两个关键能力：（1）实时热点灵感——不知道当下什么话题有流量；（2）专业模板库——没有经过验证的营销脚本框架可直接套用。加入抖音热榜采集和运营团队管理的内容模板，能让产品从"视频制作工具"升级为"营销内容策划 + 制作一体化平台"，形成核心壁垒。同时需要为 1000 用户规模做架构预备。

## What Changes

- 新增抖音热榜定时采集服务：每小时从 `https://v2.xxapi.cn/api/douyinhot` 拉取热搜数据，存入数据库并缓存到 Redis，前端通过 API 展示当前热点
- 新增热点与脚本生成联动：AI 生成脚本时可关联热点话题，LLM 提示词融入热点信息，至少 1 条脚本自然蹭上热点
- 新增内容模板运营管理系统：运营人员创建/审核/发布带变量槽位的营销脚本模板（358 结构），用户端可浏览、筛选并填入自身信息一键渲染脚本
- 新增模板分类体系：按行业（房产/电商/教育/餐饮等 8 大行业）、内容类型（产品介绍/促销/知识分享/故事/客户见证）、钩子类型（9 种开场钩子）三维分类
- 新增模板与热点关联规则：模板可声明适合蹭的热点关键词和季节事件，系统根据当前热榜自动推荐匹配模板
- 新增管理员认证与权限系统：独立的管理员用户表、JWT 认证、两级角色权限（editor/admin）
- 新增管理后台 API 路由：模板 CRUD、状态流转（draft→published→archived）、排序推荐、热榜监控
- 新增数据库表：DouyinHotItem、DouyinHotSnapshot、ContentTemplate、AdminUser
- 新增 Cron Jobs：热榜采集（每小时）、历史数据清理（每日）
- 新增缓存策略：公共数据长缓存、热榜 70 分钟缓存、模板更新时主动失效
- 新增并发限制：用户级视频生成并发限制（free:1/basic:3/pro:5），依赖 credits 体系控制总量

## Capabilities

### New Capabilities

- `douyin-hot-service`: 抖音热榜定时采集（每小时 Cron）、降级链（xxapi→vvhan）、数据存储与去重、Redis 缓存、前端热榜 API、历史数据保留与清理
- `content-template-system`: 内容模板数据模型（脚本框架+变量槽位+视频风格绑定+行业/类型/钩子分类）、模板渲染引擎（`{{variable}}` 插值）、用户端浏览/筛选/使用 API、热点↔模板关联匹配
- `template-admin`: 管理员认证（独立 AdminUser 表+JWT）、两级角色权限（editor/admin）、模板生命周期管理 API（创建/发布/下架/恢复）、排序与推荐控制、热榜采集监控、初始管理员和模板种子数据
- `scale-and-concurrency`: 1000 用户规模的并发管理（用户级并发限制）、缓存分层策略、API 响应缓存、数据库索引优化、监控告警指标定义

### Modified Capabilities

- `script-system`: 脚本生成增加热点话题关联参数（hotTopic），LLM 提示词模板融入热点信息；新增模板渲染生成脚本的路径（选模板→填变量→渲染脚本）
- `database-schema`: 新增 4 张表（DouyinHotItem、DouyinHotSnapshot、ContentTemplate、AdminUser）及关键索引
- `project-scaffold`: 新增环境变量（CRON_SECRET、DOUYIN_HOT_*_URL）、新增 lib 模块（douyin-hot.ts、template-engine.ts）、新增 Cron 路由配置（vercel.json）

## Impact

- **代码**: 新增 `lib/douyin-hot.ts`（热榜服务）、`lib/template-engine.ts`（模板渲染）、`app/api/cron/douyin-hot/`（Cron）、`app/api/hot-topics/`、`app/api/templates/`（用户端）、`app/api/admin/`（管理后台全套路由）
- **API**: 新增约 20 个 API 端点（热榜 1 个、用户端模板 3 个、管理端模板 CRUD + 状态流转 ~12 个、管理员认证 1 个、Cron 2 个、管理端数据面板 1 个）
- **数据库**: 新增 4 张 Prisma 表 + 约 8 个索引
- **依赖**: 无新外部依赖（使用 fetch 调用免费 API；模板渲染为纯字符串替换）
- **外部系统**: xxapi.cn（免费抖音热搜 API，无 SLA）、vvhan.com（备用降级源）
- **基础设施**: 新增 2 个 Vercel Cron Job；Redis 增加约 50KB 缓存（热榜数据）；MySQL 月增约 35MB（热榜历史）
- **环境配置**: 新增 `CRON_SECRET`、`DOUYIN_HOT_PRIMARY_URL`、`DOUYIN_HOT_FALLBACK_URL` 环境变量
