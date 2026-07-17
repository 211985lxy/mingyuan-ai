# 项目补充规则（运维与部署）

> 本文件是根 `AGENTS.md` 的补充，只记录部署、发布和运行环境约束。产品架构、命令和硬规则以根 `AGENTS.md` 为准。

## 仓库身份

- 当前独立 `mingyuan` 项目的唯一正本仓库：`https://github.com/211985lxy/mingyuan-ai.git`（私有）。
- 正本远程名固定为 `origin`；首次推送和远程回读完成前，以 `.release-control.json` 的 `bindingStatus` 明确标记待办，不得假装已备份。
- `https://github.com/211985lxy/aimarkting.git` 是历史外层 monorepo，内部曾包含 `mingyuan/` 子目录，但与当前独立仓库 Git 历史不相连，不得绑定为当前项目的 `origin`。
- 判断“最新版本”时以正本仓库的候选发布分支和明确 commit SHA 为准，不以本机其他 worktree、历史外层仓库或聊天记录为准。

## 部署与运维（仅部署环境，开发机无此配置）

- Kube 配置：`KUBECONFIG=~/.kube/config-ask-aibao365`（部署机，开发机不存在）
- 阿里云 AccessKey：profile 名为 `aliyun-aibao365`，存储在 `~/.aliyun/config.json`（部署机）
- ECS 独立部署脚本：`mingyuan/scripts/deploy-ecs-standalone.sh`
- 发布默认从明确 commit 部署，不从大量未提交改动里临时挑文件。临时 worktree 指定文件发布只用于用户明确要求的抢修，发布后要回收成 commit。
