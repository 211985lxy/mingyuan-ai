# 部署草稿（待审批）

这里放的是**尚未合入**生产编排的片段。根 `docker-compose.prod.yml` 与 `k8s/`
属审批区，本目录只是把「要粘什么、为什么这么配」先写清楚，审批通过后照抄即可。

| 文件 | 用在哪 | 状态 |
| --- | --- | --- |
| `compose.fragment.yml` | 根 `docker-compose.prod.yml` | 待审批 |
| `k8s.fragment.yaml` | `k8s/hypit-renderer.yaml` | 待审批 |

## 一、构建镜像（Hypit 源码不进镜像仓库）

Hypit 是**修改版 Apache-2.0**：不得再分发。所以 CLI 源码不能 COPY 进构建上下文，
改用 build context 从宿主机注入：

```sh
# 宿主机上准备好源码（CI 里改成 checkout）
cp -R /path/to/hypit-repo /tmp/hypit-src

docker build \
  --build-context hypit=/tmp/hypit-src \
  -t clip-registry-vpc.cn-hangzhou.cr.aliyuncs.com/mingyuan/hypit-renderer:latest \
  services/hypit-renderer
```

镜像约 6.1GB（含完整 Chrome + headless-shell + 静态 ffmpeg 9.0.1 + CJK 字体）。
构建期会固化 Runtime Worker 包并自检 ffmpeg 的 AAC 时长，冷启动不再联网。

## 二、Web 侧需要的环境变量

| 变量 | 值 | 说明 |
| --- | --- | --- |
| `HYPIT_ENABLED` | `true` | **总开关，默认关**。按 runbook 灰度逐级放开 |
| `HYPIT_RENDERER_URL` | `http://mingyuan-hypit-renderer:8787` | 内网地址，不下发浏览器 |
| `HYPIT_API_TOKEN` | 与渲染服务同一个 | 服务端内部共享 token |
| `HYPIT_SHADOW_MODE` | `true` → 灰度期 | 产物落 `hypit-shadow/` 前缀，不污染正式路径 |
| `HYPIT_MAX_CONCURRENT` | `1` | **别调高**：一个 Runtime 只服务一个 CLI，>1 只排队不变快 |
| `HYPIT_POLL_TIMEOUT_MS` | 默认 900000 | 渲染比 SaaS 慢得多，给足 |

把 `HYPIT_API_TOKEN` 同时写进 `mingyuan-web-secrets` 与 `mingyuan-hypit-renderer-secrets`
（k8s），或 compose 里共用 `${HYPIT_API_TOKEN}`。

## 三、灰度顺序（照 runbook §灰度）

1. 先 `HYPIT_SHADOW_MODE=true` + `HYPIT_ENABLED=true`，内部账号跑通；
   产物落隔离前缀，业务侧不受影响。
2. 观察轮询结算：槽位计数（`digital-human:hypit:inflight`）、渲染耗时、
   `renderOutputs` 是否三条齐全。
3. 关影子模式，正式对外。**回滚只关开关，不删数据**。

## 四、为什么副本数恒为 1

Hypit Runtime 与 CLI 一对一绑定，同一个 workspace 跑两个实例会互相踩状态。
所以 k8s 用 `strategy: Recreate`（绝不滚动）、compose 不设 `deploy.replicas`。
要扩容只能起**多套独立 workspace + 各自的 PVC**，不能靠加副本。
