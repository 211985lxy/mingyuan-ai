## Why

ClipFlow 是一款面向中小企业主、电商卖家、房产中介、教育机构和自媒体的 AI 营销短视频自动生成平台。用户输入文案后，系统需要完成语音生成、数字人口播、字幕生成、视频包装，并输出可下载、可复用、可发布的营销短视频。目标体验是 3 分钟出片，产品本质是 AI 视频生产平台，而不是单纯的数字人工具。

当前仓库只有产品文档和 OpenSpec 配置，尚未形成可实现、可验证的规范化需求。需要把 MVP 边界、核心能力和验收标准收敛成可落地的 OpenSpec 变更。

## What Changes

这是一个全新项目初始化，包含以下变更：

- 搭建 Next.js + TypeScript 项目脚手架（App Router, Tailwind CSS, shadcn/ui）
- 集成 Prisma ORM + PostgreSQL 数据库，建立 MVP 所需核心数据模型（users, avatars, assets, scripts, video_tasks）
- 集成 Redis 用于 Webhook 幂等处理和兜底轮询锁
- 实现用户系统：注册、登录、账号管理、套餐与额度管理（free/basic/pro）
- 实现资产系统：数字人创建（上传自拍视频 → 闪剪极速克隆）、素材管理（图片 / 视频 / 音乐）、数字人绑定声音信息展示
- 实现脚本系统：AI 生成口播脚本（调用 LLM）、脚本编辑与保存
- 实现视频生成系统：选择数字人 + 脚本 + 素材 → 调用闪剪 API 生成带字幕和基础包装的营销短视频，Webhook 接收异步结果，兜底轮询机制
- 实现视频库与首页：首页展示额度和最近视频，我的视频页展示状态、预览和下载入口
- 实现前端页面：首页、视频生成向导（3 步）、我的视频、资产管理、账户设置
- 实现阿里云 OSS 文件上传（用户自拍视频 / 素材）和成片持久化存储
- 闪剪 OpenAPI 集成（数字人克隆 + 视频生成 + Webhook 回调）

MVP 暂不实现：自动发布（Chrome 插件）、外部账号绑定 OAuth、复杂模板系统、数据分析。

## Capabilities

### New Capabilities

- `project-scaffold`: Next.js 项目脚手架、目录结构、环境配置、shadcn/ui 集成、Prisma + Redis + OSS + Auth 客户端初始化
- `database-schema`: PostgreSQL 数据模型设计（users, avatars, assets, scripts, video_tasks）及 Prisma schema 定义
- `user-system`: 用户注册、登录、账号信息管理、套餐（free/basic/pro）与额度（credits）展示和访问控制
- `asset-system`: 数字人资产（上传视频 → 闪剪克隆 → avatar + speaker 绑定）、素材资产（图片/视频/音乐上传至 OSS）、声音信息展示
- `script-system`: AI 脚本生成（输入行业/卖点/城市 → LLM 生成 3 条口播脚本）、脚本编辑与保存
- `video-generation`: 核心视频生成流水线 — 选择数字人 + 脚本 + 素材 → 生成带字幕和基础包装的营销短视频 → Webhook 接收结果
- `video-library`: 首页与我的视频页展示最近生成结果、任务状态、预览和下载
- `billing-and-credits`: 视频生成前额度校验、成功后按时长结算 credits、失败不扣费
- `webhook-handler`: 统一 Webhook 接收端点（POST /webhook/shanjian），处理数字人克隆和视频生成两类异步回调，Redis 幂等去重

### Modified Capabilities

无（全新项目）

## Impact

- **代码**: 从零创建整个项目目录结构，包括前端页面、API 路由、数据库模型、第三方集成
- **API**: 新增 10+ REST API 端点（auth、avatars、assets、scripts、tasks、videos、upload、webhook）
- **依赖**: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Prisma, Redis 客户端, 阿里云 OSS SDK, Auth.js/NextAuth, LLM SDK 等
- **外部系统**: 闪剪 OpenAPI（数字人克隆 + 视频生成）、阿里云 OSS（上传素材和持久化成片）、PostgreSQL、Redis、LLM 服务
- **基础设施**: 需要 PostgreSQL 实例、Redis 实例、阿里云 OSS Bucket、闪剪 API 密钥、LLM API 密钥
