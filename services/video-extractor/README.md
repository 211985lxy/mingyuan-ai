# AIM Video Extractor

自托管降级服务。抖音公开视频优先使用 [f2](https://github.com/Johnserf-Seed/f2)，其他已支持平台使用 [yt-dlp](https://github.com/yt-dlp/yt-dlp)，语音转写使用 [faster-whisper](https://github.com/SYSTRAN/faster-whisper)。

```bash
docker build -t mingyuan-video-extractor .
docker run --rm -p 8080:8080 \
  -e VIDEO_EXTRACTOR_API_KEY=change-me \
  -v extractor-data:/data \
  mingyuan-video-extractor
```

Web 应用配置：

```env
VIDEO_EXTRACT_FALLBACK_ENABLED=true
VIDEO_EXTRACT_FALLBACK_URL=http://video-extractor:8080
VIDEO_EXTRACT_FALLBACK_API_KEY=change-me
```

GPU 部署时设置 `WHISPER_DEVICE=cuda`、`WHISPER_COMPUTE_TYPE=float16`。只处理公开视频，入口和下载后的媒体均限制为 10 分钟、200 MB。
