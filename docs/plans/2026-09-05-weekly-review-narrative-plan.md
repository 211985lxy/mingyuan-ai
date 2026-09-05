# 周报四段式长文生成实施计划（WP-D 移交项）

> 状态：已实现（2026-09-05，提前于原排期，含单测） · 日期：2026-09-05
> 来源：《2026-09-04-retro-agent-attribution-wpd-plan.md》第三节："不做周报 LLM 四段式长文生成（原 P2 愿景）：本期只做数据进入 + 强制段落，长文另行立项。"
> 对齐：岗位卡「数据复盘官」输出四段式——已确认的数据事实 / 基于数据的判断 / 暂时不能确定的原因 / 下一轮建议。

## 交付记录（2026-09-05）

- `lib/aim/weekly-review-narrative.ts`：事实段由纯函数从结构化真源逐条拼出（数字与 JSON 完全一致）；二/三/四段由 LLM 补写（`LLMClient.shared()`，可注入替身）；LLM 失败/截断/缺标题 → 回退模板初稿并如实标注 fallbackReason；全空数据周返回 empty（显式「不编造结论」），不调用 LLM。
- 路由：`api/aim/review/weekly` 增 `?narrative=1`，env `AIM_WEEKLY_NARRATIVE_ENABLED` 灰度（默认关；直接读 process.env，与 lark 模块同做法，不动 env.ts）。
- UI：`weekly-business-review.tsx` 增「四段式周报」折叠区（标注「自动初稿 · 对外使用前必须人工审核」）；`project-weekly-business-review.tsx` 透传。
- 测试：`aim-weekly-review-narrative.test.ts` 9 例 + `weekly-review-route.test.ts` 增 2 例（灰度门控）。
- 验收对照：①事实段数字一致 ✅ ②全空周不出假报告 ✅ ③样本不足建议含「继续积累数据」✅。
- 已知边界：docx 导出复用未做（周报暂无导出入口，markdown 可直接复制；导出接入随客户月报 R3 一并评估）。

## 一、现状

WP-D 已交付：归因记录进入复盘块（`content-outcome-context.ts`）、复盘提示词强制归因段（`aim-agent-content-retro-prompts.ts` 6 段）、选题归因聚合（`attribution-insights.ts`）、周报 UI「选题归因」段（`weekly-business-review.tsx`）。**缺的是：把周报数据自动组织成岗位卡四段式长文报告**（当前只有指标卡与归因表，没有叙事层）。

## 二、改动面（立项时细化）

1. `lib/aim/weekly-review-narrative.ts`：输入 `computeWeeklyReview` + `taskInsights` 输出，按四段式模板生成 markdown 长文骨架——只填「已确认事实」段（逐条引用数据）；「判断」「不确定」「建议」三段由 LLM 在事实段约束下补写，提示词声明岗位卡纪律（不把相关写成因果、样本不足不下结论、空值≠0）。
2. `api/aim/review/weekly` 增 `narrative` 字段（可灰度开关，默认关）。
3. 周报 UI 增「四段式报告」折叠区；导出复用 docx 管线。

## 三、边界

- LLM 只做叙事组织，不产生新数据；所有数字必须来自结构化真源。
- 生成后进人审（客户可见内容人审 100% 红线）。
- 单条内容复盘（content_retro）已有 6 段提示词，不重复改；本 WP 只做**周度**叙事。

## 四、验收

- 同一份数据生成的四段式中，事实段数字与 JSON 完全一致；
- 全空数据周不出假报告（显式「本周无已回填数据」）；
- 样本不足周的建议段必须包含「继续积累数据」选项而非硬结论。

## 五、依赖与排序

依赖 WP-E 月报跑通后的真实数据样本（叙事质量取决于数据密度）。建议排在 WP-E 验收之后、R2 末（约 10 月上旬）。
