# 项目补充规则（运维与部署）

> 本文件是根 `AGENTS.md` 的补充，只记录部署、发布和运行环境约束。产品架构、命令和硬规则以根 `AGENTS.md` 为准。

## 仓库身份

- 当前独立 `mingyuan` 项目的唯一正本仓库：`https://github.com/211985lxy/mingyuan-ai.git`（私有）。
- 正本远程名固定为 `origin`；首次推送和远程回读完成前，以 `.release-control.json` 的 `bindingStatus` 明确标记待办，不得假装已备份。
- `https://github.com/211985lxy/aimarkting.git` 是历史外层 monorepo，内部曾包含 `mingyuan/` 子目录，但与当前独立仓库 Git 历史不相连，不得绑定为当前项目的 `origin`。
- 判断“最新版本”时以正本仓库的候选发布分支和明确 commit SHA 为准，不以本机其他 worktree、历史外层仓库或聊天记录为准。

## 部署与运维

ECS 独立部署只认这一条路。开发机不用装 rsync、cwRsync 或 choco。

- 前提只有部署密钥：`~/.ssh/mingyuan_aliyun_deploy`（权限 600）。
- Windows（Git Bash）：`scripts/deploy-windows.sh`
- macOS / Linux：`scripts/deploy-ecs-standalone.sh`
- 传输用系统自带的 `tar` 和 `ssh`：本地打一个包上传，远端对上 sha256 再解压。
- 先演练再真发。演练会跑本地检查并上传到服务器临时目录，不会改 systemd、不会动数据库、不会切换线上版本：
  - `DRY_RUN=1 bash scripts/deploy-windows.sh`
  - 确认没问题后：`bash scripts/deploy-windows.sh`
- 发布默认从明确 commit 部署，不从大量未提交改动里临时挑文件。临时 worktree 指定文件发布只用于用户明确要求的抢修，发布后要回收成 commit。

下面两项是旧的 Kube 部署机配置，这条 ECS 脚本用不到，开发机上也不存在：

- Kube 配置：`KUBECONFIG=~/.kube/config-ask-aibao365`
- 阿里云 AccessKey：profile 名为 `aliyun-aibao365`，存储在 `~/.aliyun/config.json`
