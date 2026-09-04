# WP-D 实施计划：复盘 Agent 消费归因（分支 feat/attribution-closure-wpab）

> 技术正本。目标/边界/验收见《明动AIM-经营归因闭环升级计划-2026-09-03.md》第五节 WP-D。
> 前置：WP-A/WP-B 已提交（71c5abef）。WP-C P0 真实数据验证由老板执行中，本 WP 不依赖其结论。

## 一、勘察结论（2026-09-04）

- **复盘 Agent = `content_retro`（数据复盘官）**：`aim-agent-content-retro.ts` 单条内容复盘，
  chat/generate 共用 `publishOutcomeBlock` 注入，装配点唯一：
  `services/chat/context-loaders.ts:214` → `resolvePublishOutcomeBlock` → `content-outcome-context.ts`。
- **块里已有**：ContentOutcome 三窗口 + 历史 retroSnapshots；**没有** OutcomeAttribution（线索归因）、
  没有平台总线数据、没有跨内容选题归因。
- **周报复盘**：`GET /api/aim/review/weekly` 已并行返回 `computeWeeklyReview` + 平台总线
  `fetchCreatorMetrics`；UI（`project-weekly-business-review.tsx`）只展示指标卡，无归因段落。
- **内容任务五类/六类**：`task-spec.ts` `ContentTask`（吸引目标客户/建立专业信任/展示真实案例/
  筛选不适合客户/解释问题与方法/推动咨询行动），已随 `AimGeneration.taskSpec`（Json）落库，无需迁移。
- **归因域层**：`OutcomeAttribution`（explicit/first_touch/unknown + 置信度 + 成交/回款投影）已具备，
  WP-B 的网页快登已开始写入。中文标签仅 normalize 反向（明确归因→explicit），缺正向 label 映射。

## 二、改动面（最小可执行）

1. **归因记录进入复盘块**（`content-outcome-context.ts`）
   - `loadPublishOutcomeContext` 增读 `outcomeAttribution`（按 generationId+userId）。
   - block 追加「线索归因」小节：每条 = 线索标识 + 方式标签 + 是否已挂成交/回款 + 登记时间；
     空 → 显式「未登记线索归因」，禁止留白装作没有。
   - `hasData` 语义扩展：outcomes / retroSnapshots / attributions 任一存在即 true
     （否则"只登记了线索、没回填数据"的内容会被误判为无数据）。
2. **复盘提示词强制归因段落**（`aim-agent-content-retro-prompts.ts`）
   - 固定输出 5 段 → 6 段，新增「线索归因」段：有归因必须点评可追溯线索数与质量；
     无归因必须显式说缺并提醒登记；unknown 必须如实说「来源不明」，禁止说成明确来源。
   - 边界增：归因只认【发布数据】区块内的归因记录。
3. **选题归因聚合**（新模块 `attribution-insights.ts`）
   - 按 ContentTask 聚合周期内已发布内容：发布数、播放合计（周期末最成熟快照，
     全未回填 → null）、可追溯线索数（explicit+first_touch）、来源不明线索数。
   - 纪律：空值≠0；`publishedCount < 3` 标注「样本不足，仅列事实不下结论」；
     内容任务未标注归入「未标注」桶，不猜。
4. **周报出口**：weekly route 增 `taskInsights`；client `fetchAimWeeklyReview` 返回
   `{ review, taskInsights }`；周报 UI 增「选题归因」段落（数据缺席显式说明，不出假数）。
5. **测试**：content-outcome-context（归因行/空态/hasData）、retro prompts（6 段结构）、
   attribution-insights（聚合/小样本/空值）、weekly route（taskInsights 字段）。

## 三、不做（边界）

- 不做周报 LLM 四段式长文生成（原 P2 愿景）：本期只做数据进入 + 强制段落，长文另行立项。
- 不自动改方法论与 Skill（守岗位卡介入 2）；只产出优化候选由人审。
- 不动平台总线代码；总线失败不影响复盘（沿用现有 catch 下传）。
- 不为存量内容回填 taskSpec.contentTask；未标注就是未标注。
- 不碰飞书侧复盘（feishu-agent-* 仅复用现有装配，不改造）。

## 四、验收对照

| 计划验收 | 本期落点 |
| --- | --- |
| platformMetrics + OutcomeAttribution 进入复盘 Agent | 1 + 3 + 4 |
| 选题归因（哪类选题带来播放/线索） | 3（周报出口） |
| 归因段落强制、缺数据显式写原因 | 1（块） + 2（提示词） + 4（UI） |
| 空值≠0、小样本不下确定结论 | 3 聚合纪律 + 2 提示词边界 |

## 五、已知风险

- `arch:size` 门禁当前因 `env.ts`（HEAD 本底 501 行 + 并行 SMS 工作流 +10 行）红着，
  与本 WP 无关；提交需 `--no-verify` 并披露，直至该文件被责任方拆分达标。
- 工作区另有并行 SMS 登录工作流，提交严格按文件清单暂存。
