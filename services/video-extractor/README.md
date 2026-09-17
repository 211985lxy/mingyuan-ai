# AIM Video Extractor

自托管降级服务。抖音公开视频优先使用 [f2](https://github.com/Johnserf-Seed/f2)，其他已支持平台使用 [yt-dlp](https://github.com/yt-dlp/yt-dlp)，语音转写使用 [faster-whisper](https://github.com/SYSTRAN/faster-whisper)。

```bash
# API Key 自己生成，不要沿用示例值：启动时会自检，占位符（change-me / test-key 等）
# 与不足 16 位的弱 Key 会记录安全告警；设 VIDEO_EXTRACTOR_STRICT_KEY=true
# 可让自检不通过时直接拒绝启动。
KEY="$(openssl rand -hex 32)"

docker build -t mingyuan-video-extractor .
docker run --rm -p 8080:8080 \
  -e VIDEO_EXTRACTOR_API_KEY="$KEY" \
  -v extractor-data:/data \
  mingyuan-video-extractor
```

Web 应用配置：

```env
VIDEO_EXTRACT_FALLBACK_ENABLED=true
VIDEO_EXTRACT_FALLBACK_URL=http://video-extractor:8080
VIDEO_EXTRACT_FALLBACK_API_KEY=<与上面同一把 Key>
```

GPU 部署时设置 `WHISPER_DEVICE=cuda`、`WHISPER_COMPUTE_TYPE=float16`。只处理公开视频，入口和下载后的媒体均限制为 10 分钟、200 MB。

## 配置项

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `JOB_DB_PATH` | `/data/jobs.sqlite3` | 任务库（SQLite + WAL） |
| `WORK_DIR` | `/data/work` | 下载与转写的临时目录 |
| `VIDEO_EXTRACTOR_API_KEY` | 空 | Bearer Key。**未设置时所有请求恒 401**（fail-closed） |
| `VIDEO_EXTRACTOR_STRICT_KEY` | `false` | `true` 时 Key 自检不通过即拒绝启动 |
| `EXTRACTOR_WORKERS` | `2` | 任务线程池大小 |
| `RATE_LIMIT_PER_MINUTE` | `10` | 每把 Key 每分钟提交上限，`0` 关闭 |
| `DISK_MIN_FREE_BYTES` | `524288000` | 剩余空间低于此值拒绝新任务（磁盘熔断） |
| `WHISPER_MODEL` | `small` | 模型规格 |
| `WHISPER_DEVICE` | `cpu` | `cpu` / `cuda` |
| `WHISPER_COMPUTE_TYPE` | `int8` | GPU 建议 `float16` |
| `WHISPER_BEAM_SIZE` | `5` | 解码搜索宽度 |
| `WHISPER_VAD_FILTER` | `true` | 静音过滤 |
| `WHISPER_NUM_WORKERS` | `1` | 模型层并发度（CTranslate2 `inter_threads`） |
| `F2_DOUYIN_ENABLED` | `true` | 抖音优先走 f2，失败回落 yt-dlp |
| `DOUYIN_COOKIE` | 空 | f2 拉取抖音所需的 Cookie |

### 并发与内存的取舍

`EXTRACTOR_WORKERS` 管的是**任务线程池**；`WHISPER_NUM_WORKERS` 管的是**模型内部**能同时处理
几个转写（CTranslate2 的 `inter_threads`）。默认值为 `1`，即多个转写请求在模型层排队 ——
线程池是并发的，转写是串行的。要让转写真正并行，把两者设为相同值，代价是内存占用随并发数
成倍增长（faster-whisper 官方文档原文：*at the cost of increased memory usage*）。

**不要**用「每个线程各建一个模型实例」来换并行：`WhisperModel` 自身支持多线程并发调用
`transcribe()`，多实例只会白翻内存，并不比调 `num_workers` 更快。

### 转写指标

每次任务结果里带 `metrics`：`device` / `compute_type` / `model` / `beam_size` / `vad_filter` /
`duration_seconds` / `chars_per_second` / `avg_logprob` / `no_speech_prob` / `compression_ratio` /
`language` / `language_probability`。

用途是让"线上悄悄回退到 cpu+int8"或"模型开始复读幻觉"这类问题从看不见变成看得见：
`compression_ratio` 明显低于历史均值通常意味着该片段在编词。旧版 faster-whisper 不提供该字段
时记 `null` 而非 `0`，避免字段缺失被读成"一切正常"。

