# WP-2.2 学习注入

> 状态：代码完成 · 日期：2026-09-12 · 分支：`feat/wp11-outcome-autofetch`（尚未拆 PR）
> 上游：批次 2 / WP-2.2
> 红线：只注入已批准/已晋升的 methodology_revision / skill_draft；eval_fixture 不进稿；查库失败变空数组，不挡出稿。

## 1. 改了什么

- `prepareAimContext` 增加第五路 learnings。教训拼进知识前缀，handler 不用改就能进稿。
- `learningsHash` 打进 run metadata（和 promptHash/contextHash 一样，只跟候选 id 有关）。
- eval 增加 4 条带教训的 content_producer 样本，总数 92 → 96。
- `contextOverride` 时用冻结 learnings，不查库。

## 2. 不做

- 不自动批准候选。
- 不把教训当系统策略覆盖。
- 不宣称真实生成里负面判断码已经下降——那是放量验收。

## 3. 回滚

`loadLearningsForContext` 改成恒返回 `[]`，metadata 仍可留空字段。
