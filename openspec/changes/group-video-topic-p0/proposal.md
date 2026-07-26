## Why

群聊视频→选题是 90 天收敛正本的 P0 生产闭环。代码主干已具备 Inspiration Pipeline、ChannelBinding、飞书入口与影子模式；当前缺口是**生产配置、真实样本验收与渠道稳定性**，不是再开第二套管道。

## What Changes

- 冻结以 `backup/group-video-topic-pipeline-pre-main-20260722` 为参考，**不整包 merge**（与 main 冲突过多且 main 已含管道）。
- 以生产验收清单驱动：环境变量、功能开关、ChannelBinding、视频提取、影子样本、飞书回执。
- WorkBuddy / 企微仅在专用设备与稳定群 ID 就绪后启用；飞书主链优先。

## Impact

- 配置与运维验收为主；必要时修幂等、项目隔离与错误追踪小洞。
- 不触碰内容血缘迁移；不混入 AIM 收敛包范围外的 UI 重构。
