# 文档导航

本目录同时包含现行规则、运行时方法论和历史方案。阅读顺序以项目根 `CLAUDE.md` 声明的真源为准；“被保留”不等于“当前实现依据”。

## 当前真源

- `../AGENTS.md`：产品原则与开发红线。
- `../PROJECT.md`：部署、发布和运行时约束。
- `architecture/adr-001-aim-harness-execution-kernel.md`：Harness 唯一执行内核决策。

## 运行时知识

- `methodologies/`：智能体实际调用的方法论资产；修改前应核对代码引用。
- `guides/`：模型、内容模板与 E2E 测试指南；属于操作参考，不覆盖根规则。
- `runbooks/branch-release-governance.md`：唯一候选分支、收敛决策和回滚规则。
- `guides/copywriting-polish-and-quality-single-entry.md`：文案润色与质检的活路径说明。
- `design-system/`：现有品牌与界面设计资料。
- `guides/accounts.md`：凭据保存禁令与安全处置说明，不存放真实账号密码。

## 方案与历史材料

- `plans/`、`reports/`：计划、审计和阶段性记录，默认不代表已经实现。
- `reports/release-convergence-2026-07-17.md`：当前候选分支的门禁证据、发布阻断项和放行路径。
- `superpowers/`：特定阶段的设计与实施计划，以代码、测试和当前真源为最终依据。
- `reports/competitor-analysis-research.md` 与 `architecture/competitor-analysis-technical-design.md`：2026-04 的竞品调研和当时方案。
- `architecture/topic-hot-competitor-architecture-optimization.md`：2026-07-07 的待审方案。
- `runbooks/FAST_PRODUCTION_LAUNCH.md`：早期上线资料，仅作背景参考。
- `guides/表达模板.md`：通用内容研究手册，不是应用架构规则。

## 维护约定

新增文档时必须说明它属于“当前真源、运行时知识、方案、报告或历史材料”中的哪一类。方案落地后，应更新现行架构文档；不要让计划文件静默升级为事实。发现文档与代码冲突时，以代码和测试为事实依据，再修正文档。
