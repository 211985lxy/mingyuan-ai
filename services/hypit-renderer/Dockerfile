# ══════════════════════════════════════════════════════════════════════════
#
#  刻意不写 `# syntax=docker/dockerfile:1.x`：那行会让构建先去拉
#  docker/dockerfile 镜像，在受限网络里会卡在 auth.docker.io 的 token 请求上
#  （2026-09-16 实测：连续两次 DeadlineExceeded）。Docker 29 的内置前端已经
#  支持 --build-context，没有理由为语法糖多一次跨网拉取。
#
#  Hypit 渲染服务镜像
# ══════════════════════════════════════════════════════════════════════════
#
#  ✅ 状态：**已在 Linux 容器内实测通过**（2026-09-16, linux/arm64）。
#     一条完整 Build 在容器内跑通并导出真实 MP4：h264 1080×1920 / 30fps /
#     180 帧 / AAC / 6.000000s。记录见 docs/ACCEPTANCE-CONTAINER.md。
#
#     过程中撞了四个 Linux 特有的坑，都会在「帧全渲完、编码也做完」之后才失败，
#     且报错信息不指向真因。下面每处依赖都写了当时的证据：
#       · `ps` 在 slim 镜像里根本不存在 → 装 procps
#       · Debian 的 ffmpeg 5.1 会让 mux 音频采样数断言差 3360 → 换静态 9.0.1
#       · hyperframes 的浏览器表没有 linux/arm64 → 运行时钉死路径
#       · Worker 首次 runtime up 要联网装包 → 构建期固化
#
#  ── 为什么镜像里不含 Hypit 本体 ─────────────────────────────────────────
#  Hypit 是第三方授权软件（修改版 Apache-2.0，条款见 LICENSE）。合规上应由部署方
#  自行获取，而不是 vendor 进 AIM 的仓库与镜像。源码通过 BuildKit 的额外构建
#  上下文传入，并**在镜像内重建依赖**：
#
#      # 1) 准备一份不含 node_modules 的源码副本
#      rsync -a --exclude node_modules --exclude .hypit \
#        ~/Doubao/skills/hypit-repo/ /tmp/hypit-src/
#
#      # 2) 构建
#      docker build -f services/hypit-renderer/Dockerfile \
#        --build-context hypit=/tmp/hypit-src \
#        -t mingyuan/hypit-renderer services/hypit-renderer
#
#  绝不能把宿主机的 node_modules 直接拷进来：宿主是 macOS 时，里面的原生模块是
#  Mach-O 二进制，在 Linux 里必然加载失败，且症状往往出现在渲染收尾阶段，很难查。
#
#  ── 为什么不复制 macOS 的 ps 垫片，却必须装 procps ─────────────────────
#  tools/ps-shim/ 是为 macOS 26 封锁系统 `ps` 准备的（Node 子进程调用被拒 EPERM）。
#  Linux 不受那个限制，垫片不该进镜像——但**这不等于 Linux 不需要 `ps`**。
#  bookworm-slim 里根本没有它，而 HyperFrames 在 Linux 上同样靠 `ps` 做进程树收尾，
#  于是渲染会在最后一步以 `spawn ps ENOENT` 失败（见上方 procps 注释）。
#  渲染服务侧 `HYPIT_PS_SHIM` 已按平台自适应（app/config.py），垫片源码留在仓库里
#  供 macOS 部署自愈用。

# ── 阶段 1：Hypit 本体与其依赖 ──────────────────────────────────────────
FROM node:22-bookworm-slim AS hypit-deps

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# workspace 里有原生模块，装一套最小编译链兜底；没有预编译产物的包会用到。
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate

WORKDIR /opt/hypit
COPY --from=hypit . /opt/hypit

# 即便调用方漏了 --exclude node_modules，这里也兜底清一遍。
RUN find /opt/hypit -name node_modules -type d -prune -exec rm -rf {} + \
 && pnpm install --frozen-lockfile

# ── 阶段 2：ffmpeg 静态构建 ─────────────────────────────────────────────
#
# ══ ffmpeg：必须是 8.x 级，不能用 Debian 自带的 5.1 ══════════════════════
# 这不是「版本越新越好」的偏好问题，是**正确性问题**。
#
# media.local 在 mux 之后断言：成片音轨的呈现采样数必须**精确等于**时间轴采样数
# （media-execution/src/execute.ts，`Final mux audio presentation span differs
# from TimelineAudio`）。而 AAC 有编码器起播延迟，mp4 靠编辑列表把它裁掉——
# 5.1 与 8.x 在这一步的处理不同，实测同一份输入：
#
#     ffmpeg 8.1（macOS，已通过验收）  6.000000 s / 283 帧  → 288000 采样 ✅
#     ffmpeg 5.1（bookworm）          5.930000 s / 279 帧  → 284640 采样 ❌
#     ffmpeg 9.0.1（静态构建）         6.000000 s / 283 帧  → 288000 采样 ✅
#
# 差 3360 个采样，断言必挂。宿主用别的版本去 ffprobe 容器产物，读到的仍是
# 5.93s——所以这是**产物字节差异**，不是探测差异，换 ffprobe 救不了。
#
# 因此改用静态构建覆盖 Debian 的 ffmpeg/ffprobe（/usr/local/bin 优先于 /usr/bin）。
# media.local 的 ffmpegPath 默认就是 "ffmpeg"，走 PATH，无需改 profile。
#
# ⚠️ 静态构建是 GPL 许可（含 libx264）。内部自用无碍；若要对外分发本镜像，
#    需先确认 GPL 合规。Debian 的 ffmpeg 同样是 GPL，口径未变。
FROM mwader/static-ffmpeg:9.0.1 AS ffmpeg-bin

# ── 阶段 3：运行时 ──────────────────────────────────────────────────────
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # Chrome 安装位置：@hypit/browser-capture 通过这个变量定位浏览器
    PUPPETEER_CACHE_DIR=/opt/puppeteer \
    # 镜像内的路径契约，覆盖 app/config.py 的中性默认值
    HYPIT_BIN=/opt/hypit/hypit \
    HYPIT_CWD=/opt/hypit \
    # Linux 的 ps 正常，垫片必须关掉（config.py 已按平台自适应，这里再显式一次）
    HYPIT_PS_SHIM=0 \
    HYPIT_HOST=0.0.0.0 \
    HYPIT_PORT=8787 \
    HYPIT_STATE_DIR=/app/state \
    HYPIT_EXPORT_DIR=/app/outputs \
    VIRTUAL_ENV=/app/.venv \
    PATH=/app/.venv/bin:$PATH

# 三类必需品，缺任何一样都会以难查的方式失败：
#   fonts-noto-cjk  —— 缺了中文全渲成方块（macOS 有系统字体，把这个问题掩盖了）
#   ffmpeg          —— 媒体处理与最终编码（**用阶段 2 的静态构建，见下方 COPY**）
#   Chrome 共享库   —— 缺了浏览器根本起不来，且报错信息不指向缺库
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 python3-venv ca-certificates curl \
      # unzip 是 @puppeteer/browsers 装 Chrome 时的解压依赖；slim 镜像不带它，
      # 缺了会在这一步报 "no zip archiver is available"（2026-09-16 实测）。
      unzip \
      # procps 提供 `ps`。**这不是 macOS 专属需求**：bookworm-slim 默认不带 ps，
      # 而 HyperFrames 的进程树收尾逻辑处处调用它，缺了会在帧全部渲染完、
      # 编码也做完之后才失败，报 "spawn ps ENOENT"——症状与 macOS 26 上被
      # 沙箱拒绝（EPERM）时完全一样，只是错误码不同。（2026-09-16 容器内实测）
      procps \
      fontconfig \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 libxshmfence1 \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

# hyperframes 走浏览器采集，并且用到了 Chrome 153 才引入的原生录制协议——
# 版本由 @hypit/browser-capture 固定（见其 src/browser.ts），这里必须装同一个。
# 两个包各找各的浏览器，且都不是可移植的（详见 scripts/resolve-browser.sh）：
#   @hypit/browser-capture → 完整 Chrome，版本固定 153.0.8010.12
#   @hyperframes/engine    → chrome-headless-shell
# 两个都在构建时装好。运行时才补装意味着每次冷启动都要联网，生产上不可接受。
RUN npx --yes @puppeteer/browsers install chrome@153.0.8010.12 --path "$PUPPETEER_CACHE_DIR" \
 && npx --yes @puppeteer/browsers install chrome-headless-shell@153.0.8010.36 --path "$PUPPETEER_CACHE_DIR"

# 非 root 运行：Chrome 以 root 启动需要 --no-sandbox，而那会削弱隔离。
# 用普通用户可保留沙箱，代价是容器需要 SYS_ADMIN（compose 里显式声明）。
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin hypit

COPY --from=hypit-deps --chown=hypit:hypit /opt/hypit /opt/hypit
RUN chown -R hypit:hypit /opt/puppeteer

# 静态 ffmpeg 覆盖 Debian 的 5.1：/usr/local/bin 在 PATH 中先于 /usr/bin。
# 原因见阶段 2 的说明——5.1 的 AAC 呈现采样数与 8.x 不同，会让 mux 断言失败。
COPY --from=ffmpeg-bin /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg-bin /ffprobe /usr/local/bin/ffprobe
RUN chmod 0755 /usr/local/bin/ffmpeg /usr/local/bin/ffprobe \
 # 构建期自检：PATH 上解析到的必须是这份静态构建（8.x 级），否则说明被系统版抢先。
 && ffmpeg -version | head -1 \
 && ffprobe -version | head -1 \
 # 行为自检：复现 mux 命令，断言 6 秒音轨的呈现时长**精确**为 6.000000。
 # 这一条就是当初能在构建期拦住 ffmpeg 5.1 的检查——把 3360 个采样的差异
 # 从「跑了三分钟渲染之后才失败」提前到「构建时就报错」。
 && ffmpeg -y -v error -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=6" -ac 2 -c:a pcm_s16le /tmp/probe.wav \
 && ffmpeg -y -v error -f lavfi -i "color=c=black:s=64x64:r=30:d=6" -c:v libx264 -pix_fmt yuv420p -frames:v 180 /tmp/probe.mp4 \
 && ffmpeg -y -v error -i /tmp/probe.mp4 -i /tmp/probe.wav -map 0:v -map 1:0 -c:v copy -c:a aac -ar 48000 -ac 2 -frames:v 180 -movflags +faststart /tmp/probe-out.mp4 \
 && test "$(ffprobe -v error -select_streams a -show_entries stream=duration -of csv=p=0 /tmp/probe-out.mp4)" = "6.000000" \
 && echo "ffmpeg AAC presentation span self-check passed (6.000000s)" \
 && rm -f /tmp/probe.wav /tmp/probe.mp4 /tmp/probe-out.mp4

WORKDIR /app

# Python 侧：FastAPI 包装层。用 venv 避开 Debian 的 PEP 668 externally-managed 限制。
COPY --chown=hypit:hypit requirements.txt ./requirements.txt
RUN python3 -m venv "$VIRTUAL_ENV" \
 && "$VIRTUAL_ENV/bin/pip" install --no-cache-dir --upgrade pip \
 && "$VIRTUAL_ENV/bin/pip" install --no-cache-dir -r requirements.txt

COPY --chown=hypit:hypit app ./app
COPY --chown=hypit:hypit scripts ./scripts
COPY --chown=hypit:hypit smoke ./smoke
COPY --chown=hypit:hypit run.sh ./run.sh

# ══ 产品模板：必须落在**工作区根**下的 templates/ ══════════════════════════
# 工作区根缺省是 HYPIT_CWD=/opt/hypit（config.py：hypit_workspace 未设时回落到它），
# 内联提交的源也写在那里。而模板源里的素材/recipes 一律写成
# `./templates/<name>/…` 这样的**相对**路径——因为 `.svs` 的 `<import source>`
# 只接受相对路径或 npm 包名，绝对路径会被当成 npm 包 spec 直接失败。
# 所以模板必须烤进 /opt/hypit/templates，放到别处（比如 /app/templates）
# 会让所有 AIM 模板提交找不到素材。
COPY --chown=hypit:hypit templates /opt/hypit/templates

# Runtime 状态与导出目录：**必须持久化**，否则容器重建就丢掉 Runtime 与产物。
RUN mkdir -p /app/state /app/outputs && chown -R hypit:hypit /app/state /app/outputs
VOLUME ["/app/state", "/app/outputs"]

USER hypit

# 预热 Runtime：`runtime up` 首次运行会在 ~/.local/state/hypit/packages 下联网安装
# koffi / tsx / typescript 等 Worker 依赖。实测首次超过 60s，之后 17s。生产容器不能
# 把这一步留到运行时——那意味着每次冷启动都要有外网，且第一次请求必然超时。
# 这里跑一次 up/down，只为了把包固化进镜像；Worker 本身在容器启动时再拉起。
RUN set -eux; \
    # shellcheck source=scripts/resolve-browser.sh
    . /app/scripts/resolve-browser.sh; \
    export_hyperframes_browser_path; \
    cd /opt/hypit; \
    ./hypit runtime up --runtime /app/smoke/hypit.runtime.json --json | tail -c 400; \
    ./hypit runtime down --runtime /app/smoke/hypit.runtime.json --json > /dev/null

EXPOSE 8787

# 用脚本而不是 curl 命令行：避免把 token 暴露在进程列表里。
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
  CMD ["python3", "/app/scripts/healthcheck.py"]

CMD ["/app/scripts/entrypoint.sh"]
