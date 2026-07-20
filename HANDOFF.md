# 项目交接文档

## 1. 当前任务背景

- 我们正在升级 AIM 的群聊视频选题自动采集链路：用户在飞书群、WorkBuddy 微信助手或企业微信中转发视频链接，系统识别消息，提取视频文案，调用 AI 生成选题，写入正式 `TopicSelection`，并向原群反馈处理状态和结果。
- 抖音群不建设浏览器直连监听；抖音链接由用户人工转发到飞书或微信入口。
- 项目目标是形成可审计、可重试、可幂等的闭环：`消息接收 → 触发/权限校验 → Inspiration 幂等入库 → 视频文案提取 → AI 选题 → KnowledgeEntry + TopicSelection 原子写入 → 群内回复`。
- WorkBuddy 只承担个人微信协议和收发消息，AIM 不接触个人微信协议。若 WorkBuddy 无法稳定调用 HTTPS API 或异步回原群，则不能作为生产入口，改用企业微信官方接口兜底。
- 技术栈：Next.js 16、TypeScript、Prisma/MySQL、Vitest、飞书 `@larksuiteoapi/node-sdk`、FastAPI、自托管 `f2`/`yt-dlp`/`faster-whisper`。
- 项目目录：`/Users/xiangyu/Desktop/明动aim智能体/mingyuan`
- 生产站点：`https://mingyuan-ai.cn`
- 正本仓库：`https://github.com/211985lxy/mingyuan-ai.git`
- 生产发布约束：禁止在生产使用 `prisma db push`；发布必须基于明确 commit，不能从混杂脏工作树直接部署。

## 2. 已完成工作

### 功能与代码

- 新增统一事件入口和状态查询：
  - `POST /api/agent/v1/inspiration/events`
  - `GET /api/agent/v1/inspiration/events/{id}`
- 新增 WorkBuddy/企业微信持久化出站箱：
  - `POST /api/agent/v1/inspiration/replies/claim`
  - `POST /api/agent/v1/inspiration/replies/{id}/ack`
- 飞书入口已切换到 `@larksuiteoapi/node-sdk`，包含事件解密、签名/token 校验、文本消息解析、即时确认和幂等最终回复。
- 新增企业微信 AES 加密回调：`GET/POST /api/integrations/wecom/events`。
- 新增 `ChannelBinding` 管理 API 和账户设置界面，支持绑定、启停、删除和配置检查。
- 扩展 `Inspiration`：项目、外部消息、幂等键、处理阶段、视频/知识/选题关联、回复状态等字段。
- 实现原子 dedupe upsert；没有消息 ID 时，用群 ID、发送者 ID、消息内容和五分钟时间窗口生成幂等键。
- 异步流水线已实现：纯文本直接生成选题；视频先调用现有 Provider；可降级错误调用自托管服务；`KnowledgeEntry` 和 `TopicSelection` 在同一事务创建。
- 自托管视频提取服务位于 `/services/video-extractor`：抖音优先使用 `f2`，失败后使用 `yt-dlp`；转写使用 `faster-whisper`。
- 视频限制已实现：公开视频、最长 10 分钟、最大 200 MB；拒绝内网地址、媒体文件直链和未知协议。
- 后台任务已升级：单次最多 20 条、最大并发 4、执行器注册表、任务租约恢复、1/5/30 分钟退避。
- K8s CronJob 已改为每分钟执行。
- 增加影子模式，以及飞书、WorkBuddy、企业微信、视频 fallback 的独立开关。
- WorkBuddy Skill：`apps/web/public/skill-workbuddy-wechat.md`。
- 上线 Runbook：`docs/runbooks/group-video-topic-pipeline.md`。
- 数据库 migration：`apps/web/prisma/migrations/20260721130000_add_channel_inspiration_pipeline/migration.sql`。

### 关键代码位置

- `apps/web/src/features/topics/services/inspiration-events.ts`
- `apps/web/src/features/topics/services/inspiration-pipeline.ts`
- `apps/web/src/features/topics/services/inspiration-reply.ts`
- `apps/web/src/app/api/integrations/feishu/events/route.ts`
- `apps/web/src/lib/integrations/wecom-callback.ts`
- `apps/web/src/lib/background-task-executors.ts`
- `apps/web/src/lib/topic-chat-service.ts`
- `apps/web/prisma/content.prisma`
- `scripts/deploy-ecs-standalone.sh`

### 验证结果

- 主工作树 TypeScript 检查通过。
- 测试类型检查通过。
- 全量测试通过：229 个文件、1451 项。
- Next.js 生产构建通过。
- Prisma migration integrity、API contracts、架构护栏、领域边界、Prisma 查询边界通过。
- Compose 配置和 K8s YAML 解析通过。
- 本次功能修改文件 ESLint 无 error。
- 全局 lint 仍有约 10 个原有后台管理页面 `react-hooks/set-state-in-effect` error，与本功能无关。

### 重要决策

- 复用现有 AIM Runtime、Agent API Key、BackgroundTask 和 `TopicSelection`，不引入 Dify、CowAgent、第二套 Agent Runtime 或第二套队列。
- WorkBuddy 是闭源微信网关；仓库只能提供 Skill/API 契约，不能在本地验证真实微信收发能力。
- 企业微信只有在官方回调确实提供可绑定 `ChatId` 时才能作为群入口，不能假设能监听所有普通内部群。
- 默认使用影子模式，真实验收前不写正式选题、不回群。

## 3. 当前状态

- **代码阶段：基本完成；生产阶段：尚未上线。** 功能代码和测试已经在主工作树中，但尚未完成生产迁移、环境配置、外部平台真实联调和正式部署。
- 当前分支：`main`。
- 当前本地 HEAD：`7801106`。
- 当前线上健康检查信息：
  - `releaseSha`: `a4ecc8a708a2ca6fec121ecac4d69c664d0d3896`
  - `buildTime`: `2026-07-19T17:21:21Z`
  - 数据库、Redis、飞书均健康。
- 本地 HEAD 与线上 release SHA 不一致，并且本地 `main` 当前显示相对 `origin/main` `ahead 1`。必须先 `git fetch origin` 并确认提交历史关系，禁止直接部署本地 HEAD。
- 主工作树存在大量其他未提交改动，包含后台管理、选题生成、文案和本功能改动。不能通过 `ALLOW_DIRTY_DEPLOY=1` 强行发布。
- 本功能独立 worktree：`/Users/xiangyu/Desktop/明动aim智能体/.worktrees/group-video-topic-pipeline`，分支 `feat/group-video-topic-pipeline`，基于 `7801106`，目前没有 commit。主工作树最后一次飞书严格 token 校验只在主工作树中，发布前要同步该修改。

### 已知正常工作的部分

- 统一事件契约、鉴权边界、幂等入库逻辑和状态查询已通过单元/类型测试。
- 飞书事件处理、解密、token 校验、文本解析、即时确认和最终回复逻辑已实现。
- 视频 Provider 编排、自托管 fallback 编排、选题生成和 TopicSelection 原子写入逻辑已实现。
- 后台任务执行器、租约恢复、并发限制和退避逻辑已实现并通过测试。
- 数据库 migration 文件和 API/架构护栏检查已通过。

### 未完成部分

- 尚未执行生产数据库 migration，也未确认 `scripts/deploy-ecs-standalone.sh` 是否会执行新增 Prisma migration；该脚本当前偏向 schema patch/contract 校验。
- 尚未配置生产环境变量和正式的 `ChannelBinding`。
- 尚未在 WorkBuddy 专用常开设备、测试微信号和白名单群完成真实验收；尤其是群标识、发送者、原文、异步轮询和原群第二条消息回发能力待确认。
- 尚未完成企业微信官方回调的真实验收；是否能稳定提供群 `ChatId` 待确认。
- 尚未构建/部署自托管视频提取服务镜像，真实 `f2`、`yt-dlp`、`faster-whisper` 路径待验收。
- 尚未使用真实飞书群、WorkBuddy 微信群、企业微信样本验收长链、短链、无效链接、超长视频、Provider 失败和降级。
- 尚未确认 ECS systemd 后台任务 timer 实际是否已从五分钟改为每分钟；K8s CronJob 已改为每分钟，但 ECS 与 K8s 是两套发布路径。

### 当前阻塞/错误

- Docker 镜像检查失败，原因是 Docker Hub 网络鉴权，不是代码错误：

```text
failed to authorize: failed to fetch oauth token:
Post "https://auth.docker.io/token":
read ... connection reset by peer
```

- 全局 lint 的约 10 个后台管理页面错误是既有问题，不应误判为本功能引入，也不要在本工作包中顺手重构。
- `mingyuan-ai.cn` 看起来走 ECS standalone；K8s ingress 清单对应 `www.aibao365.com.cn`。上线前必须确认目标环境，不要混用两条发布路径。

## 4. 下一步行动计划

1. **保护并分离当前改动。**
   - 在 `mingyuan` 目录执行：
     ```bash
     git status --short
     git fetch origin
     git log --oneline --decorate --graph --all -30
     curl -fsS https://mingyuan-ai.cn/api/healthz
     ```
   - 确认 `origin/main`、本地 `7801106` 和线上 `a4ecc8a...` 的关系。
   - 不要在当前脏 `main` 上执行 pull、rebase、reset、checkout、stash 或 clean。
   - 基于正确的最新生产 commit 创建新的 clean worktree，再移植本功能。

2. **确认上线范围和目标环境。**
   - 向用户确认是只发布群聊采集功能，还是连当前其他后台/选题改动一起发布。
   - 确认使用 ECS standalone 还是 GitHub Actions/K8s。
   - 若只发布本功能，从独立 worktree 生成边界清晰的 commit/patch，并同步主工作树中的飞书严格 token 校验。

3. **修正并验证生产迁移流程。**
   - 检查 `apps/web/scripts/apply-production-schema-patches.mjs` 是否覆盖 `20260721130000_add_channel_inspiration_pipeline`。
   - 推荐使用 `pnpm --dir apps/web exec prisma migrate deploy`，不要用 `prisma db push`。
   - 迁移前做生产数据库备份并记录备份标识。
   - 迁移后执行 `prisma migrate status` 和 `schema:verify`。

4. **配置影子模式环境变量。**
   ```env
   INSPIRATION_PIPELINE_ENABLED=true
   INSPIRATION_PIPELINE_SHADOW_MODE=true
   BACKGROUND_TASKS_ENABLED=true
   FEISHU_TOPIC_PIPELINE_ENABLED=true
   WORKBUDDY_WECHAT_ENABLED=false
   WECOM_INSPIRATION_ENABLED=false
   VIDEO_EXTRACT_FALLBACK_ENABLED=false
   ```
   - 配置 `FEISHU_TOPIC_CHAT_ID`，或通过账户设置界面建立 `ChannelBinding`。

5. **先只发布 Web 与 Schema。**
   - 使用明确 commit 发布，确认 `/api/healthz` 的 `releaseSha` 等于部署 commit。
   - 确认后台任务 timer 为每分钟。
   - 在影子模式中验证只创建 `Inspiration` 和解析结果，不创建正式 `TopicSelection`、不回群。

6. **完成真实验收后逐步开启入口。**
   - 飞书：纯文本、抖音长链、抖音短链各至少一条。
   - WorkBuddy：白名单群连续运行三天，无重复、无越权且能异步回原群后再启用。
   - 企业微信：仅在官方能力提供稳定群 ID 时启用。
   - 最后关闭 `INSPIRATION_PIPELINE_SHADOW_MODE`，再逐群扩展。

7. **验收标准。**
   - 接收确认小于 3 秒。
   - 95% 任务在 5 分钟内完成。
   - 重复投递只产生一条 `Inspiration`、一条 `KnowledgeEntry` 和一条 `TopicSelection`。
   - 失败任务全部可见、可行动、可重试。

## 5. 踩坑记录（重要）

- 不要直接执行 `scripts/deploy-ecs-standalone.sh`：当前工作树 dirty，脚本会拒绝；设置 `ALLOW_DIRTY_DEPLOY=1` 会把所有混杂改动一起发布。
- 不要对当前主工作树执行 `git reset --hard`、`git checkout`、`git stash` 或 `git clean`，其中包含用户未提交改动和生成输出。
- 不要假设本地 `main` 是最新；本地 HEAD `7801106` 与线上 `a4ecc8a...` 不一致。
- 不要用 `prisma db push` 在生产建表或加字段。
- 不要声称 WorkBuddy 已生产可用；目前没有真实设备和微信群验收证据。
- 不要声称企业微信能监听所有普通内部群；官方能力取决于机器人/应用形态以及是否提供 `ChatId`。
- 回复发送失败必须使用独立 `replyErrorMessage`，不要写入 `Inspiration.errorMessage`，否则会污染流水线状态。
- 不要移除飞书严格 token 校验；当前要求 `data.token === FEISHU_VERIFICATION_TOKEN`。
- 不要把影子模式理解成“仍然回复接收确认”；当前设计是影子模式完全不回群。
- 不要重新手写视频下载或 ASR；已复用 `f2`、`yt-dlp`、`faster-whisper`。
- `pnpm prisma format` 可能格式化无关 Prisma 文件；修改 Schema 时避免制造额外 diff。
- Docker build 失败是 Docker Hub 网络问题，不要因此重写 Dockerfile。
- ECS standalone 与 K8s 是两套发布路径：生产站点当前看起来使用 ECS，K8s 清单对应另一域名。
- 主工作树改动很多，任何发布/合并前必须先按文件审查 diff，不能机械暂存全部改动。

## 6. 新对话启动指南

### 开始前先阅读

- `PROJECT.md`
- `AGENTS.md`
- `docs/runbooks/group-video-topic-pipeline.md`
- `docs/runbooks/database-migrations.md`
- `scripts/deploy-ecs-standalone.sh`

### 第一件应该执行的操作

```bash
cd "/Users/xiangyu/Desktop/明动aim智能体/mingyuan"
git status --short
git fetch origin
git log --oneline --decorate --graph --all -30
curl -fsS https://mingyuan-ai.cn/api/healthz
```

然后确认：

- `origin/main` 是否包含线上 `a4ecc8a...`。
- 用户要上线的范围，是本功能单独发布还是连同其他未提交改动发布。
- 发布目标是 ECS 还是 GitHub Actions/K8s。
- 新 migration 的生产执行方式和备份证据。

### 不要重新做的事

- 不要重新调查“功能是否已经实现”；核心代码和测试已经完成，下一阶段是隔离提交、生产迁移、部署和真实验收。
- 不要重新引入其他 Agent Runtime、队列或微信协议库。
- 不要执行 dirty deploy。
- 不要在未确认备份、迁移、环境开关和影子模式行为前开启 WorkBuddy/企业微信生产入口。
- 不要把本地单元测试通过当成飞书、WorkBuddy、企业微信或视频服务已完成真实联调。

### 待确认事项

- 线上 release SHA 与 `origin/main` 的确切祖先关系。
- 用户最终要求的上线范围和目标发布环境。
- ECS 发布脚本是否执行新增 Prisma migration，以及 ECS timer 的真实周期。
- WorkBuddy 是否能稳定取得群/发送者/消息信息，并异步向原群发送第二条消息。
- 企业微信官方回调是否提供稳定可绑定群 `ChatId`。
- 自托管视频提取镜像能否在目标环境成功构建、拉取模型并完成真实转写。

