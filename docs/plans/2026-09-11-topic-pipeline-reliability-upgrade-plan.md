# 选题链路可靠性完整升级计划

> 日期：2026-09-11 · 状态：待执行（Phase 0 可立即开工）
> 背景：对标链接 → 按客户人设生成选题的核心链路已端到端验证可用（链接提取 → 四维拆解 → 选题卡 → 按项目落库 → 人工挑选），但过程中暴露出一批系统性缺陷。本计划基于当天全部实测证据，将其收口为分期可执行的升级路线。
> 真源：本文档表达目标与待办，不代表已实现；运行事实以代码与实测为准。

---

## 一、事实基线（2026-09-11 实测）

以下为当天真实验证过的结论，是本计划的依据：

| 事实 | 证据 |
|---|---|
| 链路端到端可用 | 真实抖音链接 → 813 字文案 → 3903 字拆解 → 4 张选题卡 → 落库（projectId+ipProfileId 正确，status=pending 人工闸门生效） |
| 修复后选题质量 | `deepseek-flash` 28-120s 出 4 张完整真卡，五维评分齐全，标题贴人设（如「90天把老板经验变成内容流水线」） |
| 降级语义已闭环（主路径） | generate 路由、today 缓存路由、topic-bridge（聊天/飞书 5c）三入口均透出 `degraded` |
| 环境漂移曾造成三种故障 | 迁移账本失败记录（堵后续迁移）/ 列缺失（TopicSelection、VideoStructure.projectId → 500）/ 绑定指向已合并项目（→ 409） |
| 模型路由实测延迟（generation 探针） | zenmux 14.4s ✓ · deepseek-flash 3.9s ✓ · apimart 6.0s ✓ · doubao-seed 48.6s ✓（慢但在预算内） |
| 已建门禁工具 | `pnpm dev:sanity`（迁移账本+关键列+绑定三查）、`pnpm llm:probe --task generation`（生成型探针）——**均未接入 preflight** |

当天完成的修复（**尚未提交**，见 Phase 0）：

- 路由重排：QUALITY_PRIMARY_ROUTE 改为 zenmux → deepseek-flash → apimart → doubao（末跳）
- 选题生成 maxTokens 2048→8192（思考型模型 reasoning 计入 completion）
- video-copy-analysis maxTokens 3200→8192（同机理，预防性）
- 飞书内容素材库改为可选依赖（未配置降级跳过，不炸流水线）
- authorName 不再用视频标题冒充
- degraded 透传四件套（路由+类型+hook+页面警告条）
- 新增测试：video-processor-lark-optional（3）、topic-generate-degraded（2）、topic-degradation-signal（5）；更新 agent-router-timeout 断言

---

## 二、升级路线总览

```
Phase 0 落地收口（0.5-1 天）    提交修复包 + 门禁接入 preflight
Phase 1 链路完整性与产出质量（5-7 天）  5b 并路由 / 降级卡治理 / 预算审计 / 短链打通
Phase 2 多客户运营效率（4-6 天）      素材跟随 / 配额监控 / 客户接入 SOP
Phase 3 评估与长期（持续）           质量评估集 / 降级率监控 / 延迟趋势
```

依赖关系：Phase 0 是一切前提；Phase 1 内部 1.1 优先（其余项都受益于统一路由治理）；Phase 2/3 相互独立可并行。

---

## Phase 0：落地收口（P0 · 本周 · 约 0.5-1 天）

### 0.1 提交当前修复包

- **内容**：上述全部已验证改动（8 个修改文件 + 3 个新测试文件 + dev:sanity/探针脚本）。
- **方式**：按 Conventional Commit 在 `mingyuan` 仓库提交。他人改动的飞书 OAuth 文件严禁混入（`git add` 精确点名文件）。
- **验证**：提交前 `pnpm typecheck && pnpm lint`，提交后 `git status` 干净（除他人文件）。
- **风险**：低。改动均已单测+E2E 验证。

### 0.2 门禁接入 preflight

- **问题**：`dev:sanity`（环境漂移）与 `llm:probe --task generation`（路由健康）已存在但没人跑，下次演示前仍可能踩同样的坑。
- **方案**：
  1. `apps/web/package.json` 新增 `preflight:env`：串联 `dev:sanity` + `llm:probe -- --route business_diagnosis --task generation`（探针失败不阻断——第三方瞬态故障常见，仅黄字警告；sanity 失败阻断）。
  2. 根 `Makefile` preflight 增加 `preflight:env` 一步（根仓库单独小提交，需用户确认）。
- **验证**：故意改坏一个绑定 → preflight 失败退出；恢复 → 通过。
- **风险**：低。探针消耗少量 token（每跳一次小生成，约 4 次调用）。

---

## Phase 1：链路完整性与产出质量（P1 · 1-2 周 · 约 5-7 天）

### 1.1 5b 摘要并入模型路由链 【高优先】

- **问题**：`video-processor.generateAiSummary` 用独立 DeepSeek 客户端（`LLM_SUMMARY_API_KEY` 直连），完全绕开路由链——预算治理、熔断、多级降级对它全部失效；本地未配该变量时聊天流水线 5b 直接失败（有明确报错，但整条断）。
- **方案**：改用 `getAgentLLM()` 共享链（与选题生成同治理），`LLM_SUMMARY_*` 三个环境变量标记废弃，`.env.example` 注明迁移路径；保留一个版本的兼容期读取。
- **改动点**：`video-processor.ts` 5b 段、`env.ts`、`.env.example`。
- **验证**：单测 mock 路由链确认调用；E2E 聊天发链接跑通 5a-5e（本地无需 LARK_CONTENT_*、无需 LLM_SUMMARY_*）。
- **估时**：1 天。**风险**：摘要质量随模型变化，需对比三五个真实样本。

### 1.2 降级卡治理：不允许被静默选用

- **问题**：降级模板卡仍会以 `pending` 候选落库，与真卡混在选题池；现在「可见」了，但人工仍可能选用降级卡去写稿。
- **方案**：选题池候选卡渲染时，`model` 带 `:fallback` 的记录显示「降级模板」徽标；选用（`[id]/select`）时若为降级卡返回 409 + 明确提示「请重新生成后再选用」。
- **改动点**：`/api/topics/[id]/select` 路由、候选面板组件、`TopicSelection` 序列化补 model 字段。
- **验证**：单测（select 409 分支）；E2E 用 fallback 记录走选用被拒。
- **估时**：0.5 天。**风险**：低。

### 1.3 生成类 maxTokens 全面审计

- **问题**：同「思考型模型 reasoning 计入 completion」机理的残余位点（route 首跳为思考型模型且输出长的场景）：
  - `knowledge-entity-extractor.ts` 2000
  - `script-generation/generation.ts` 1500
  - `quality-gate.ts` rewrite 路径
  - `aim-memory.ts` 1200、`aim-chat-evolution.ts` 900 等
- **方案**：逐点核对任务形状（输出长度 + 所在链路首跳是否思考型），按规则「思考型链路生成任务 ≥8192，短判别任务维持小预算（省成本）」逐个裁定并改；不确定的维持现状记录在案。
- **验证**：每改动一处跑对应单测；抽 2-3 处真实数据 E2E。
- **估时**：1 天。**风险**：低（纯参数，可逆）。

### 1.4 maxAttempts 覆盖全部路由跳数

- **问题**：`LLM_MAX_PROVIDER_ATTEMPTS` 默认 3，QUALITY_PRIMARY_ROUTE 有 4 跳——末跳（doubao）只有在熔断打开前面跳时才可达，冷启动期首跳挂死时全链 200s+。
- **方案**：默认值 3→4（或按路由长度取 max）；同时给 zenmux 首跳评估降超时（50s→30s，配合熔断快速换路，参考 work_editor 的「先快失败再换路」注释）。
- **验证**：单测断言 attempts 覆盖；本地关代理模拟首跳死，观察总耗时下降。
- **估时**：0.5 天。**风险**：中（改默认影响所有调用方成本语义，需在 PR 说明）。

### 1.5 短链解析打通：评论与单视频数据

- **问题**：`v.douyin.com` 分享短链（抖音 App 复制链接的主流形态）在 `extractVideoId` 显式 `return null`，评论抓取链路断；单条链接拿不到点赞/播放数（TikHub 批量统计需要 aweme_id）。
- **方案**：复用账号侧适配器已有的 302 探测逻辑（`adapters/douyin.ts` resolveShortUrl），抽出共享工具函数解析视频短链 → aweme_id；接入 `fetchTopComments` 与 `fetch_multi_video_statistics`。
- **验证**：真实短链单测 + E2E（短链 → 提取 → 拆解 → 评论数/点赞数入库）。
- **估时**：1.5 天。**风险**：中（抖音短链格式可能变化，需容错降级为「无统计数据」而非失败）。

### 1.6 选题 prompt 强制 hook/angle 输出

- **问题**：deepseek-flash 偶发不输出 hook/angle 字段（UI 有兜底文案但体验降级）。
- **方案**：`buildTopicSystemPrompt` 中将 hook/angle 列为必填字段并在 JSON schema 描述中加粗要求；normalize 兜底维持。
- **估时**：0.5 天。**风险**：低。

---

## Phase 2：多客户运营效率（P2 · 2-4 周 · 约 4-6 天）

### 2.1 项目合并素材跟随

- **问题**：账号换绑/项目合并后，`VideoCopyExtraction`、`TopicSelection` 等仍留在旧 projectId 下，新项目选题生成拿不到历史对标素材（当天实测踩到）。
- **方案**：扩展 `merge-account-projects.ts`：合并项目时把素材类表（videoCopyExtraction / topicSelection / watchAccount / benchmarkProfile）的 projectId 迁移到目标项目；迁移前后计数对账输出。
- **验证**：测试库演练合并 → 素材计数一致 → 新项目选题源包含旧拆解。
- **估时**：1.5 天。**风险**：中（数据迁移需在测试库先演练，生产执行需审批）。

### 2.2 青豆配额监控

- **问题**：文案提取按量计费，无消耗统计与告警，额度耗尽表现为用户侧「提取失败」。
- **方案**：每次提交任务在 Redis 计数（按日/按月），管理接口暴露消耗；超阈值（如月配额 80%）日志告警。
- **估时**：1 天。**风险**：低。

### 2.3 客户接入 SOP 自动化

- **问题**：新客户接入要「人设完整 + 项目绑定 + 元素库种子」三件事齐，现在靠人记（人设完整度门禁已有，后两项无检查）。
- **方案**：`dev:sanity` 扩展 `--onboarding <userId>` 模式：检查 IpProfile.isComplete、绑定 active 项目、TopicElement ≥N 条，输出缺项清单。
- **估时**：0.5 天。**风险**：低。

### 2.4 apimart 流式响应观察项确认

- **问题**：curl 不带 stream 参数时 apimart 返回 SSE；provider 显式 `stream:false` 未复现问题。
- **方案**：一次真实联调抓包确认；若网关忽略 stream:false，在 provider 层加 SSE 容错解析。
- **估时**：0.5 天。**风险**：低（第三跳，影响面小）。

---

## Phase 3：评估与长期（P3 · 持续）

### 3.1 选题卡质量评估集

- 把「质量差」从主观变可度量：沉淀 20-50 条真实场景（人设 × 素材源）的 golden prompt 集，人工对产出卡评分（贴人设/有钩子/可执行三维），接入 `aim-eval` 框架，路由或 prompt 改动前后跑对比。这是防止「修了又坏」的根本手段。

### 3.2 降级率监控

- `TopicSelection` 按 `model LIKE '%:fallback'` 统计日降级率，超阈值（如 >10%）告警；配合 3.1 形成质量+可用性双仪表。

### 3.3 路由延迟常态化采样

- `llm:probe --task generation` 每日定时跑一轮落库，延迟趋势对比（今天 zenmux 走代理 14s、瞬态挂死，这种波动只有趋势数据能发现）。

---

## 三、验收标准（四层）

1. **代码层**：每项改动带单测；`pnpm typecheck && pnpm lint && pnpm test` 全绿。
2. **构建层**：Phase 1.1（动运行时路由）需过生产构建。
3. **集成层**：涉及模型/抖音/数据库的项用最小真实样本验证（短链真实解析、摘要真实生成、合并测试库演练）。
4. **上线层**：部署后健康检查 + 真实冒烟（贴一条新链接走完整链路）。

## 四、明确不做（本期边界）

- 不做项目级人设重构（IpProfile 按项目拆分）——已确认运营模式为「一客户一账号」，现有 1:1 结构匹配。
- 不动生产部署配置（k8s/docker-compose.prod/ops 需审批，本计划不涉及）。
- 不做大范围前端重构（仅降级徽标等局部改动）。
- 不替换青豆服务商（监控先行，切换另立项）。

## 五、风险与回滚

- 所有改动独立小提交，任一项出问题 `git revert` 单点回滚。
- 数据迁移类（2.1）先测试库演练并留计数对账，不满足即中止。
- 路由/预算类改动（1.1/1.3/1.4）上线后观察一周降级率与延迟趋势（依赖 3.2/3.3 的最小版）。
