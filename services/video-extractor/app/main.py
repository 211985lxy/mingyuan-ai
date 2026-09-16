import asyncio
import contextlib
import ipaddress
import json
import logging
import os
import secrets
import shutil
import socket
import sqlite3
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

MAX_DURATION_SECONDS = 600
MAX_BYTES = 200 * 1024 * 1024
MAX_REDIRECTS = 5
REDIRECT_STATUS_CODES = frozenset({301, 302, 303, 307, 308})
SECURITY_LOGGER = logging.getLogger("mingyuan.video_extractor.security")
SUPPORTED_HOST_SUFFIXES = (
    "douyin.com", "iesdouyin.com", "bilibili.com", "b23.tv", "kuaishou.com",
    "xiaohongshu.com", "xhslink.com", "channels.weixin.qq.com", "weixin110.qq.com",
    "youtube.com", "youtu.be",
)


class Settings:
    """集中配置，从环境变量读取；测试可传入隔离实例覆盖任意字段。"""

    def __init__(self, **overrides):
        get = lambda key, default: overrides.get(key, os.getenv(key, default))
        self.db_path = Path(get("JOB_DB_PATH", "/data/jobs.sqlite3"))
        self.work_dir = Path(get("WORK_DIR", "/data/work"))
        self.api_key = get("VIDEO_EXTRACTOR_API_KEY", "")
        self.extractor_workers = max(1, int(get("EXTRACTOR_WORKERS", "2")))
        self.whisper_model = get("WHISPER_MODEL", "small")
        self.whisper_device = get("WHISPER_DEVICE", "cpu")
        self.whisper_compute_type = get("WHISPER_COMPUTE_TYPE", "int8")
        self.douyin_cookie = get("DOUYIN_COOKIE", "")
        self.f2_douyin_enabled = str(get("F2_DOUYIN_ENABLED", "true")).lower() == "true"
        # F3 限流：每把 API Key 每分钟最多提交的任务数；<=0 表示不限制。
        self.rate_limit_per_minute = max(0, int(get("RATE_LIMIT_PER_MINUTE", "10")))
        # F6 磁盘熔断：work_dir 剩余空间低于此阈值时直接拒绝新任务，避免下载把磁盘写满。
        self.disk_min_free_bytes = int(get("DISK_MIN_FREE_BYTES", str(500 * 1024 * 1024)))


DEFAULT_SETTINGS = Settings()

DB_LOCK = threading.Lock()
MODEL_LOCK = threading.Lock()
WHISPER_MODEL = None  # 惰性加载（首次转写时按 settings 构建）


class RateLimiter:
    """F3：每把 API Key 一个令牌桶，按时间补充，线程安全。

    key 为空（匿名）时归到 "anonymous"。capacity 即每分钟配额，refill 秒数默认 60，
    故令牌补充速率 = capacity/60。now 可注入（测试用）便于确定性断言。
    """

    def __init__(self, capacity: int, refill_seconds: float = 60.0, now: callable = time.monotonic):
        self.capacity = max(1, capacity)
        self.refill = float(refill_seconds)
        self._now = now
        self._buckets: dict[str, tuple[float, float]] = {}  # key -> (tokens, last_ts)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = self._now()
        with self._lock:
            tokens, last = self._buckets.get(key, (float(self.capacity), now))
            tokens = min(self.capacity, tokens + (now - last) * (self.capacity / self.refill))
            if tokens < 1.0:
                self._buckets[key] = (tokens, last)
                return False
            self._buckets[key] = (tokens - 1.0, now)
            return True


def _check_disk_budget(settings: Settings | None = None):
    """F6：下载前确认 work_dir 剩余空间够用，不够直接抛错让 process_job 判失败。

    已落盘的临时文件 / 模型缓存 / 转写结果都会占 work_dir，磁盘写满会拖垮整服务，
    故在真正拉流前用熔断挡住新任务，而不是等到 write 抛异常。
    """
    settings = settings or DEFAULT_SETTINGS
    settings.work_dir.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(settings.work_dir).free
    if free < settings.disk_min_free_bytes:
        SECURITY_LOGGER.warning(
            "resource.disk_low path=%s free_bytes=%d min_bytes=%d",
            settings.work_dir, free, settings.disk_min_free_bytes,
        )
        raise ValueError("磁盘可用空间不足，请稍后再试。")


class JobRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    maxDurationSeconds: int = Field(default=MAX_DURATION_SECONDS, ge=1, le=MAX_DURATION_SECONDS)
    maxBytes: int = Field(default=MAX_BYTES, ge=1, le=MAX_BYTES)


class JobResponse(BaseModel):
    status: str
    jobId: str
    title: str | None = None
    coverUrl: str | None = None
    durationSeconds: int | None = None
    mediaSizeBytes: int | None = None
    transcript: str | None = None
    errorMessage: str | None = None


def connect(settings: Settings | None = None):
    settings = settings or DEFAULT_SETTINGS
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(settings.db_path, timeout=30, isolation_level=None)
    connection.row_factory = sqlite3.Row
    # WAL 允许读写并发，消除 F17：EXTRACTOR_WORKERS>=2 时 get_job 轮询与 update_job
    # 写竞争导致的 "database is locked" 偶发 500（无需给读路径加锁，避免限并发）。
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA busy_timeout=5000")
    return connection


def initialize_database(settings: Settings | None = None):
    settings = settings or DEFAULT_SETTINGS
    with DB_LOCK, connect(settings) as db:
        db.execute("""
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            source_url TEXT NOT NULL,
            status TEXT NOT NULL,
            result_json TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        """)
        db.execute(
            "UPDATE jobs SET status = 'failed', error_message = '提取服务重启，请重新提交任务。', "
            "updated_at = CURRENT_TIMESTAMP WHERE status IN ('queued', 'extracting')"
        )


def _is_public_address(address: str) -> bool:
    try:
        return ipaddress.ip_address(address).is_global
    except ValueError:
        return False


def _public_ip_addresses(hostname: str, port: int | None) -> list[str]:
    """解析 hostname 的全部地址并确认均属公网，返回这些地址。

    任一地址落在私网/回环/链路本地/保留段即整体拒绝——多 A 记录里混一条内网
    地址本身就是 DNS 重绑定的典型手法，不能只看"第一个能连上"。
    """
    try:
        resolved = socket.getaddrinfo(hostname, port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        SECURITY_LOGGER.warning("ssrf.blocked reason=dns_failure host=%s", hostname)
        raise ValueError("视频地址无法解析到公网 IP。") from error
    addresses = [item[4][0] for item in resolved]
    if not addresses:
        SECURITY_LOGGER.warning("ssrf.blocked reason=no_address host=%s", hostname)
        raise ValueError("视频地址必须解析到公网 IP。")
    for address in addresses:
        if not _is_public_address(address):
            SECURITY_LOGGER.warning("ssrf.blocked reason=private_address host=%s address=%s", hostname, address)
            raise ValueError("视频地址必须解析到公网 IP。")
    return addresses


def _guarded_getaddrinfo(host, port, *args, **kwargs):
    results = _PREVIOUS_GETADDRINFO(host, port, *args, **kwargs)
    addresses = [item[4][0] for item in results]
    if not addresses or any(not _is_public_address(address) for address in addresses):
        SECURITY_LOGGER.warning("ssrf.blocked reason=resolution host=%s", host)
        raise socket.gaierror(f"解析到非公网地址，已拒绝：{host}")
    return results


_RESOLUTION_GUARD_DEPTH = 0
_RESOLUTION_GUARD_LOCK = threading.Lock()
_PREVIOUS_GETADDRINFO = socket.getaddrinfo


@contextlib.contextmanager
def _public_only_resolution():
    """作用域内进程级守卫：任何 DNS 解析只要出现非公网地址就拒绝。

    给"自己管 DNS 与重定向、没法注入传输层"的下载器（yt-dlp、f2 内部请求）兜底。
    http.client / yt-dlp 走 `socket.getaddrinfo`，httpx 走 anyio → 事件循环
    `getaddrinfo`（运行期在协程内取 `socket.getaddrinfo`），因此同一个守卫能覆盖两条路径；
    校验发生在解析的那一刻，返回的地址就是随后真正连接的地址，F2 的 TOCTOU 窗口随之关闭。

    用深度计数实现可重入：并发任务嵌套进入时，内层退出不会提前摘掉守卫。
    注意这是进程级补丁，作用域内**所有**出站解析都要过公网校验——本服务的出站目标
    本就全是公网（抖音/B站/CDN），不存在需要访问内网的合法场景。
    """
    global _RESOLUTION_GUARD_DEPTH, _PREVIOUS_GETADDRINFO
    with _RESOLUTION_GUARD_LOCK:
        if _RESOLUTION_GUARD_DEPTH == 0:
            _PREVIOUS_GETADDRINFO = socket.getaddrinfo
            socket.getaddrinfo = _guarded_getaddrinfo
        _RESOLUTION_GUARD_DEPTH += 1
    try:
        yield
    finally:
        with _RESOLUTION_GUARD_LOCK:
            _RESOLUTION_GUARD_DEPTH -= 1
            if _RESOLUTION_GUARD_DEPTH == 0:
                socket.getaddrinfo = _PREVIOUS_GETADDRINFO


def assert_public_url(value: str):
    return _assert_public_network(value, reject_media=True)


def _assert_public_network(value: str, reject_media: bool):
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("只支持公开的 HTTP/HTTPS 视频分享链接。")
    if reject_media and parsed.path.lower().endswith((".mp4", ".mov", ".m4v", ".webm", ".m3u8", ".mp3", ".m4a", ".wav")):
        raise ValueError("请提供视频分享页，不要提供媒体文件直链。")
    _public_ip_addresses(parsed.hostname, parsed.port)
    return value


def assert_supported_share_url(value: str):
    assert_public_url(value)
    hostname = (urlparse(value).hostname or "").lower()
    if not any(hostname == suffix or hostname.endswith(f".{suffix}") for suffix in SUPPORTED_HOST_SUFFIXES):
        raise ValueError("暂不支持这个视频平台。")
    return value


def update_job(job_id: str, status: str, result: dict | None = None, error: str | None = None, settings: Settings | None = None):
    settings = settings or DEFAULT_SETTINGS
    with DB_LOCK, connect(settings) as db:
        db.execute(
            "UPDATE jobs SET status = ?, result_json = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (status, json.dumps(result, ensure_ascii=False) if result else None, error, job_id),
        )


def whisper_model(settings: Settings | None = None):
    global WHISPER_MODEL
    settings = settings or DEFAULT_SETTINGS
    with MODEL_LOCK:
        if WHISPER_MODEL is None:
            from faster_whisper import WhisperModel
            WHISPER_MODEL = WhisperModel(
                settings.whisper_model,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
            )
    return WHISPER_MODEL


async def _stream_media(url: str, target: Path, max_bytes: int, referer: str | None = None) -> int:
    """流式下载媒体到 target，返回落盘字节数。

    F1 修复：**不自动跟随重定向**，自己走跳转循环，每一跳都重新做公网校验。
    以前 `follow_redirects=True` 把已校验过的地址交给 httpx 自己跟，302 一跳内网就出去了。

    F2 修复：整个下载过程套在 `_public_only_resolution` 里——DNS 在「即将连接的那一刻」
    被校验，返回的地址就是随后真正连接的地址，校验与连接之间没有能换 IP 的窗口。

    关于「钉 IP」：曾按安全评审建议把 URL 的 host 换成 IP 字面量再配 Host 头 + TLS
    `sni_hostname` 扩展。实测不可用——httpcore 的 HTTP 代理路径（`_async/http_proxy.py`）
    不读 `sni_hostname`，一旦部署环境存在 HTTP CONNECT 代理，TLS 会用 IP 当 SNI，
    握手直接失败。故改为「解析时刻强制校验」：同样封死 TOCTOU，且不改变请求形态、
    不与代理/SNI 打架。代理场景下本进程看不到目标解析（由代理解析），属已知盲区，
    依赖网络层出网阻断兜底。
    """
    base_headers = {"User-Agent": "Mozilla/5.0"}
    if referer:
        base_headers["Referer"] = referer
    size = 0
    current = url
    with _public_only_resolution():
        async with httpx.AsyncClient(follow_redirects=False, timeout=60) as client:
            for _ in range(MAX_REDIRECTS + 1):
                _assert_public_network(current, reject_media=False)
                async with client.stream("GET", current, headers=base_headers) as response:
                    if response.status_code in REDIRECT_STATUS_CODES:
                        location = response.headers.get("location")
                        if not location:
                            raise ValueError("视频下载失败：跳转响应缺少目标地址。")
                        current = urljoin(current, location)
                        continue
                    response.raise_for_status()
                    with target.open("wb") as output:
                        async for chunk in response.aiter_bytes():
                            size += len(chunk)
                            if size > max_bytes:
                                raise ValueError("视频超过200MB，暂不支持自动收录。")
                            output.write(chunk)
                    return size
    raise ValueError(f"视频下载失败：跳转次数超过 {MAX_REDIRECTS} 次。")


async def download_with_f2(url: str, target: Path, max_bytes: int, settings: Settings):
    from f2.apps.douyin.handler import DouyinHandler
    from f2.apps.douyin.utils import AwemeIdFetcher

    # f2 内部自己解析 DNS，且入参是用户提交的分享链接，套解析期守卫兜底 F2。
    with _public_only_resolution():
        aweme_id = await AwemeIdFetcher.get_aweme_id(url)
        video = await DouyinHandler({
            "headers": {"User-Agent": "Mozilla/5.0", "Referer": "https://www.douyin.com/"},
            "cookie": settings.douyin_cookie,
            "proxies": {"http://": None, "https://": None},
        }).fetch_one_video(aweme_id=aweme_id)
    duration = int((video.duration or 0) / 1000)
    if duration > MAX_DURATION_SECONDS:
        raise ValueError("视频超过10分钟，暂不支持自动收录。")
    media_url = video.video_play_addr if isinstance(video.video_play_addr, str) else next(iter(video.video_play_addr or []), None)
    if not media_url:
        raise ValueError("抖音公开视频地址解析失败。")
    _assert_public_network(media_url, reject_media=False)
    size = await _stream_media(media_url, target, max_bytes, referer="https://www.douyin.com/")
    return {"title": video.desc or None, "coverUrl": video.cover or None, "durationSeconds": duration, "mediaSizeBytes": size}


def download_with_ytdlp(url: str, directory: Path, max_duration: int, max_bytes: int):
    import yt_dlp
    output_template = str(directory / "media.%(ext)s")
    options = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "noplaylist": True,
        "max_filesize": max_bytes,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
    }
    # yt-dlp 自己管 DNS 与重定向（还可能是 HLS/DASH 分片），没法像 httpx 那样钉 IP，
    # 因此用解析期守卫兜底：解析结果必须全公网，且就是随后真正连接的地址 → 关掉 F2 的 TOCTOU。
    # 残余风险：若 yt-dlp 绕过 socket.getaddrinfo（例如交给外部进程/ffmpeg 拉流），则不在守卫内，
    # 该场景依赖网络层出网阻断兜底（见安全评审行动项 2）。
    with _public_only_resolution():
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(url, download=False)
            duration = int(info.get("duration") or 0)
            size = int(info.get("filesize") or info.get("filesize_approx") or 0)
            if duration > max_duration:
                raise ValueError("视频超过10分钟，暂不支持自动收录。")
            if size > max_bytes:
                raise ValueError("视频超过200MB，暂不支持自动收录。")
            downloader.download([url])
            files = [path for path in directory.glob("media.*") if path.is_file()]
            if not files:
                raise ValueError("视频音频下载失败。")
            media = max(files, key=lambda path: path.stat().st_size)
            actual_size = media.stat().st_size
            if actual_size > max_bytes:
                raise ValueError("视频超过200MB，暂不支持自动收录。")
            return media, {
                "title": info.get("title"),
                "coverUrl": info.get("thumbnail"),
                "durationSeconds": duration or None,
                "mediaSizeBytes": actual_size,
            }


def transcribe(media_path: Path, settings: Settings | None = None):
    settings = settings or DEFAULT_SETTINGS
    model = whisper_model(settings)
    segments, info = model.transcribe(str(media_path), vad_filter=True, beam_size=5)
    segments = list(segments)
    transcript = "".join(segment.text.strip() for segment in segments).strip()
    if not transcript:
        raise ValueError("视频中没有识别到可用语音。")
    duration = getattr(info, "duration_after_vad", None) or getattr(info, "duration", 0.0) or 0.0
    if segments:
        avg_logprob = sum(getattr(s, "avg_logprob", 0.0) for s in segments) / len(segments)
        no_speech_prob = sum(getattr(s, "no_speech_prob", 0.0) for s in segments) / len(segments)
    else:
        avg_logprob = 0.0
        no_speech_prob = 0.0
    metrics = {
        "device": settings.whisper_device,
        "compute_type": settings.whisper_compute_type,
        "model": settings.whisper_model,
        "duration_seconds": round(duration, 2),
        "chars_per_second": round(len(transcript) / duration, 2) if duration > 0 else 0.0,
        "avg_logprob": round(avg_logprob, 4),
        "no_speech_prob": round(no_speech_prob, 4),
        "language": getattr(info, "language", None),
        "language_probability": round(getattr(info, "language_probability", 0.0), 4),
    }
    return transcript, metrics


def process_job(job_id: str, request: JobRequest, settings: Settings | None = None):
    settings = settings or DEFAULT_SETTINGS
    update_job(job_id, "extracting", settings=settings)
    try:
        assert_supported_share_url(request.url)
        settings.work_dir.mkdir(parents=True, exist_ok=True)
        _check_disk_budget(settings)
        with tempfile.TemporaryDirectory(prefix=f"{job_id}-", dir=settings.work_dir) as temp_dir:
            directory = Path(temp_dir)
            parsed_host = (urlparse(request.url).hostname or "").lower()
            if "douyin.com" in parsed_host and settings.f2_douyin_enabled:
                try:
                    media_path = directory / "media.mp4"
                    metadata = asyncio.run(download_with_f2(request.url, media_path, request.maxBytes, settings))
                except Exception:
                    media_path, metadata = download_with_ytdlp(request.url, directory, request.maxDurationSeconds, request.maxBytes)
            else:
                media_path, metadata = download_with_ytdlp(request.url, directory, request.maxDurationSeconds, request.maxBytes)
            transcript, metrics = transcribe(media_path, settings)
            metadata["transcript"] = transcript
            metadata["metrics"] = metrics
            update_job(job_id, "completed", metadata, settings=settings)
    except Exception as error:
        update_job(job_id, "failed", error=str(error)[:2000], settings=settings)


def create_app(settings: Settings | None = None, executor: ThreadPoolExecutor | None = None, init_db: bool = True):
    settings = settings or DEFAULT_SETTINGS
    executor = executor or ThreadPoolExecutor(max_workers=settings.extractor_workers)
    app = FastAPI(title="Mingyuan Video Extractor", version="0.1.0")
    app.state.settings = settings
    app.state.executor = executor

    def require_api_key(authorization: str | None = Header(default=None), request: Request = None):
        if not settings.api_key or not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="unauthorized")
        if not secrets.compare_digest(authorization[7:].strip(), settings.api_key):
            raise HTTPException(status_code=401, detail="unauthorized")

    rate_limiter = RateLimiter(settings.rate_limit_per_minute) if settings.rate_limit_per_minute > 0 else None

    def rate_limit(authorization: str | None = Header(default=None)):
        if rate_limiter is None:
            return
        key = authorization[7:].strip() if authorization and authorization.startswith("Bearer ") else "anonymous"
        if not rate_limiter.allow(key):
            raise HTTPException(status_code=429, detail="too many requests")

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    @app.post("/jobs", response_model=JobResponse, status_code=202, dependencies=[Depends(require_api_key), Depends(rate_limit)])
    def create_job(request: Request, payload: JobRequest):
        try:
            assert_supported_share_url(payload.url)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        job_id = str(uuid.uuid4())
        with DB_LOCK, connect(settings) as db:
            db.execute("INSERT INTO jobs (id, source_url, status) VALUES (?, ?, 'queued')", (job_id, payload.url))
        executor.submit(process_job, job_id, payload, settings)
        return JobResponse(status="extracting", jobId=job_id)

    @app.get("/jobs/{job_id}", response_model=JobResponse, dependencies=[Depends(require_api_key)])
    def get_job(job_id: str, request: Request):
        with connect(settings) as db:
            row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="job not found")
        result = json.loads(row["result_json"]) if row["result_json"] else {}
        return JobResponse(status=row["status"], jobId=job_id, errorMessage=row["error_message"], **result)

    if init_db:
        initialize_database(settings)
    return app


# uvicorn 入口（app.main:app）。行为与改造前一致：导入即建库、绑定默认线程池。
app = create_app()
