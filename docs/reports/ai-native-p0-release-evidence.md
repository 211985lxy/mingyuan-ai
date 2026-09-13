# AIM AI 原生 P0 发布证据（WP-1，2026-09-13）

> 代码层合同回归已落地。真实模型连续绿、飞书 30 条影子、生产 SHA 对齐仍未完成。不能把本文件当成业务完成。

## 固化的 daily 失败样本

来源：GitHub Actions run `34704495609`（2026-09-12，`aim-eval-daily` artifact），当时 contract **96.7%**。

1. **正文缺失** `pq_new_koubo_04`
   - 错误原文：`模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。`
   - 新固定样本：`wp1_missing_body_01`
2. **返回分析方案而非脚本** `cp_imitate_07`（rubric 58）
   - 草稿以「本轮输入只锁定了结构」「1. 目标判定」「- businessGoal：lead」开头，却被标成 `video_script` 且格式校验通过
   - 新固定样本：`wp1_analysis_not_script_01`

## 先失败后通过

未改闸门前，6 个回归测试失败（验证器把失败说明和分析方案当成 PASS）。最小修复后：

- 交付闸门拒绝「未能返回完整正文」类线路失败文案
- 交付闸门拒绝带 `businessGoal` / `目标判定` / 「只锁定了结构」的分析方案
- `verifyAimDelivery` 在这些候选上不再调用模型
- 评测合同增加 `delivery_body` 断言

相关单测 124 通过（含 98 条 deterministic fixture 合同）。`eval:deterministic`：**contract=100.0%**。

未改 Prompt 猜修复。未改 `aim-agent-content-producer.ts`：失败点是闸门放过非交付文本，不是生产器合同本身。

## 本机门禁

| 门 | 结果 |
| --- | --- |
| typecheck / typecheck:tests | 通过 |
| WP-1 相关 vitest | 124 通过 |
| eval:deterministic | contract=100.0% |
| eval:daily（P0 工作目录无 Provider 密钥） | **失败并停止**，未静默跳过 |
| 连续 3 次真实模型 daily 绿色 | 未跑。最近一次 CI daily 仍是 96.7%（修复尚未推远程） |
| model-swap | 未跑 |
| 飞书 30 条 / 连续 5 工作日 | 未开始，需人工在绑定测试群投喂 |
| 生产发布 | 未申请。当前主干仍是 `1b12bfb8`，本修复还在 `codex/ai-native-p0-release-evidence` |

## 开关与放量

保持 `capture_only`。本工作包禁止 `live`。

## 下一步

1. 把本分支推到 GitHub 后触发 `aim-eval-daily`，连跑 3 次绿。
2. 你确认后才部署，回读 healthz 的 `releaseSha`。
3. 用已有管理员登录拉飞书 30 天指标；没有认证就停，不绕过。
4. 在测试群人工发 30 条获授权样本，连续 5 个工作日。
