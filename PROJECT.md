# 项目补充规则（运维与部署）

> 本文件是根 `Agents.md` 的补充，仅记录部署/运维相关信息。产品架构、命令、硬规则、视频包装说明等以根 `Agents.md` 为准。

## 视频架构说明

历史上视频创作是「导演层 / 编剧层 / 包装层」三层架构。现在主流程只剩**创作（导演层 + 编剧层）**，包装层（闪剪成片）已脱离主流程，标记为待删死代码。

详见根 `Agents.md` 的「视频包装」一节。

## 部署与运维（仅部署环境，开发机无此配置）

- Kube 配置：`KUBECONFIG=~/.kube/config-ask-aibao365`（部署机，开发机不存在）
- 阿里云 AccessKey：profile 名为 `aliyun-aibao365`，存储在 `~/.aliyun/config.json`（部署机）
- ECS 独立部署脚本：`mingyuan/scripts/deploy-ecs-standalone.sh`
