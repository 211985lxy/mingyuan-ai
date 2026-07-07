## 0. Runtime Contract Cleanup

- [x] 0.1 对齐前端运行时 DTO：替换 `packages/shared` 中的 mock 形状，或引入新的 API response types，消除 `dailyLimit`、`videosCreatedToday`、`thumbnailUrl` 等前台伪字段依赖
- [x] 0.2 新增统一 API client（token 持久化、Authorization 注入、401 清理、分页解包）
- [x] 0.3 清除 `apps/web/src/app/**` 中所有对 `@/lib/mock/*` 的运行时导入；mock 代码只允许保留在测试夹具中，或直接删除

## 1. IP Profile Domain

- [x] 1.1 在 Prisma 中新增 `IpProfile` 模型，并为 `userId` 建立唯一 active 约束
- [x] 1.2 创建 `GET /api/ip-profile` 与 `PUT /api/ip-profile`，统一返回档案内容和 `isComplete`
- [x] 1.3 实现服务端 completeness 规则与 prompt snapshot 构造逻辑
- [x] 1.4 为 IP 档案 API 补充 E2E 测试（首次创建、更新、未授权、未完成）

## 2. Content Template & Script Generation

- [x] 2.1 新增 `ContentGenerationRun` 模型，并扩展 `Script` 以保存 `generationRunId`、`ipProfileId`、`status`
- [x] 2.2 新增 `lib/script-generator.ts` 与 prompt builder，组装 IP 档案、模板蓝图、brief 输入和可选热点上下文
- [x] 2.3 创建 `POST /api/scripts/generate`，完成模板校验、档案校验、LLM 调用、生成批次入库、候选稿入库
- [x] 2.4 创建 `PATCH /api/scripts/[id]`，支持候选稿编辑与选中状态更新
- [x] 2.5 更新模板种子数据与管理文档，把高频模板从“静态脚本示例”迁移为“内容模板蓝图 + brief 字段定义”
- [x] 2.6 为文案生成链路补充测试（档案缺失、模板缺失、成功生成、编辑、选中）

## 3. Frontend Real API Integration

- [x] 3.1 重写 `/login` 与 `/register`，接入真实 auth API，并在成功后持久化 token 与 user
- [x] 3.2 重写 `AuthGuard`、dashboard layout 与 logout 流程，确保刷新后通过 `/api/auth/me` 恢复登录态
- [x] 3.3 重写 Dashboard、Videos、Video Detail、Assets、Account 页面，全部改为真实 API 数据
- [x] 3.4 移除 `VideoDetail` 中 fake 营销分析和 fake 发布建议；若后端仍无对应能力，则改为 `Coming Soon`
- [x] 3.5 更新 Account / Dashboard 指标，从“每日次数”切换到真实 `plan / credits / processing tasks / recent videos`

## 4. Content-First Journey

- [x] 4.1 新增 `/ip-profile` 独立 SPA，提供首次建档和后续编辑两种模式
- [x] 4.2 在 Dashboard 与 `/create` 增加建档 gating：档案未完成时主 CTA 指向 `/ip-profile`
- [x] 4.3 重构 `/create` 为 4 段式流程：选模板 → 填 brief / 生成文案 → 选中/编辑文案 → 选数字人并确认生成
- [x] 4.4 让 `/create` 使用真实 `/api/templates`、`/api/scripts/generate`、`/api/avatars`、`/api/tasks`
- [x] 4.5 在每一步加入专业引导文案，让用户理解“为什么填这些信息”和“下一步会得到什么”

## 5. Task Lineage & Asset Flow

- [x] 5.1 更新 `POST /api/tasks`，支持 `scriptId`，并在创建任务时保留 Script 快照与 `sourceTemplateId`
- [x] 5.2 重写资产页的数字人创建表单，支持真实 cloneType、素材上传、授权视频与授权文案输入
- [x] 5.3 重写素材上传链路：先请求 `/api/assets/upload-url`，完成上传后调用 `/api/assets` 注册记录
- [x] 5.4 为视频列表、详情页补齐基于真实 `coverUrl`、`videoUrl`、`errorMessage` 的展示逻辑

## 6. Validation

- [x] 6.1 E2E 走通真实主链路：注册 → 建立 IP 档案 → 选模板 → 生成候选文案 → 选数字人 → 创建视频任务
- [x] 6.2 E2E 走通真实资产链路：上传素材 → 注册素材 → 创建数字人 → 等待状态变化
- [x] 6.3 增加静态检查或测试，确保 app runtime 中不再引用 `@/lib/mock/*`
