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

## 第一次真实模型 daily（未绿）

- 运行：`34737168450`（`codex/ai-native-p0-release-evidence` @ `9c32a9e0`）
- 合同 **76.7%**，rubric 87.5%，严重虚构 0
- 原因不是闸门误杀。6 次是线路没返回正文（`cp_imitate_07` / `pq_new_koubo_03` / `pq_ground_16` 各 2 次）；另有 `cp_info_insufficient_20` 没提示信息不足；`we_xhs_10` 两次 rubric 都低于 70。
- 根因：WP-1 多了 2 条合同回归，daily 按总数均匀抽样，15 条样本被打乱，抽到了更难的 `we_xhs_10`。线路空正文以前也不重试，一次失败就记合同失败。

## 第二次真实模型 daily（未绿）

- 运行：`34738006227`（@ `4a228fdb`）
- 合同 **70.0%**，已打分样本 rubric **100%**，严重虚构 0
- `we_xhs_11` 两次 88 分，抽样打乱已修好
- `cp_imitate_07` 两次被闸门拦住：`生成结果没有满足你当前的要求，未作为正式成稿交付。`（分析方案不再当稿，但重试提示没点出「目标判定」这些原句）
- `cp_learnings_hallucination_26` / `pq_new_koubo_03` / `pq_ground_16` 线路空正文，重试一次仍空
- `cp_info_insufficient_20` 两次里有一次没提示信息不足

## 第三次真实模型 daily（未绿）

- 运行：`34738742914`（@ `bcef589b`）
- 合同 **86.7%**，rubric **100%**，严重虚构 0
- `cp_imitate_07` 两次都 88 分，分析方案拦+重试已经能写出脚本
- `pq_new_koubo_03` 两次通过
- 还剩 4 次合同失败：`cp_info_insufficient_20` 一次没认出「缺主题」；`cp_learnings_hallucination_26` 两次未成稿/空正文；`pq_ground_16` 一次空正文

已再修：把「想写什么主题」算作信息不足提示；线路失败最多再试两轮（共 3 次）。

## 第四次真实模型 daily（未绿）

- 运行：`34739523599`（@ `cef27b09`）
- 合同 **83.3%**，rubric **100%**，严重虚构 0
- `pq_ground_16` 两次通过
- `cp_info_insufficient_20` 失败原文是「这句信息量还不够，我不编」，评测没认出来
- `cp_imitate_07` / `cp_learnings_hallucination_26` 两次都空正文。更像是 content_producer 线路熔断：一道超时后，同模型后面的题全被跳过

已再修：认出「信息量还不够 / 我不编」；真实模型评测关闭线路熔断。

## 本机门禁

| 门 | 结果 |
| --- | --- |
| typecheck / typecheck:tests | 通过 |
| WP-1 相关 vitest / test:harness | 159 通过 |
| eval:deterministic | contract=100.0% |
| eval:daily（P0 工作目录无 Provider 密钥） | **失败并停止**，未静默跳过 |
| 连续 3 次真实模型 daily 绿色 | 未达成。四次分别 76.7% / 70.0% / 86.7% / 83.3% |
| model-swap | 未跑 |
| 飞书 30 条 / 连续 5 工作日 | 未开始，需人工在绑定测试群投喂 |
| 生产发布 | 未申请。当前主干仍是 `1b12bfb8` |

## 开关与放量

保持 `capture_only`。本工作包禁止 `live`。

## 下一步

1. 再触发 `aim-eval-daily`，连跑 3 次绿。
2. 你确认后才部署，回读 healthz 的 `releaseSha`。
3. 用已有管理员登录拉飞书 30 天指标；没有认证就停，不绕过。
4. 在测试群人工发 30 条获授权样本，连续 5 个工作日。
