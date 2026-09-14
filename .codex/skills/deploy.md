---
name: deploy
description: "把当前 main 部署到生产 ECS（本地构建 → rsync → systemctl 重启），并盯完健康检查。"
category: DevOps
tags: [deploy, ecs, systemd, production]
---

把 `origin/main` 最新代码部署到生产（ECS standalone）。

## 真实部署链路（唯一在用的）

生产部署走 **`scripts/deploy-ecs-standalone.sh`**（本地 build → rsync → systemctl 重启 `mingyuan-web`）。
`.github/workflows/deploy.yml` 的 ACR→K8s 链路**从未跑通**（缺 ACR 凭证），已改为手动触发，**不要指望 push 到 main 会自动部署**。

## 步骤

1. **确认部署基线**：`git fetch origin && git checkout --detach origin/main`。
   脚本会把本地 HEAD 写入 release-manifest，并在线上回读校验，所以必须在最新 main 上、工作区干净。
2. **预检（只读）**：
   - `curl -fsS https://mingyuan-ai.cn/api/healthz` 记录当前 releaseSha
   - `ssh -i ~/.ssh/mingyuan_aliyun_deploy root@120.25.106.146 systemctl is-active mingyuan-web`
3. **执行**：`bash scripts/deploy-ecs-standalone.sh`
   - 脚本自带：部署互斥锁、模型链/Fish 探针门禁、迁移（切码前，失败即中止）、
     备份+失败自动回滚、ECS 内网健康检查、releaseSha 回读校验
4. **确认结果**：脚本输出 `healthz releaseSha=<sha> (expected <sha>)` 且 `deployed: https://mingyuan-ai.cn/api/healthz` 即成功。

## 注意

- 生产 env 在服务器 `/etc/mingyuan/mingyuan.env`（600）；改完需重启服务才生效
- 新增环境变量要先在该文件补齐再部署，否则功能上线即报「未配置」
- 脚本支持跳过开关（`SKIP_MIGRATIONS` / `SKIP_MODEL_PROBE` / `SKIP_FISH_PROBE`），非紧急不要用
