# 项目补充规则（运维与部署）

> 本文件是根 `AGENTS.md` 的补充，只记录部署、发布和运行环境约束。产品架构、命令和硬规则以根 `AGENTS.md` 为准。

## 部署与运维（仅部署环境，开发机无此配置）

- Kube 配置：`KUBECONFIG=~/.kube/config-ask-aibao365`（部署机，开发机不存在）
- 阿里云 AccessKey：profile 名为 `aliyun-aibao365`，存储在 `~/.aliyun/config.json`（部署机）
- ECS 独立部署脚本：`mingyuan/scripts/deploy-ecs-standalone.sh`
- 发布默认从明确 commit 部署，不从大量未提交改动里临时挑文件。临时 worktree 指定文件发布只用于用户明确要求的抢修，发布后要回收成 commit。
