import asyncio
import ipaddress
import json
import os
import secrets
import socket
import sqlite3
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import httpx
import yt_dlp
from fastapi import Depends, FastAPI, Header, HTTPException
from faster_whisper import WhisperModel
from pydantic import BaseModel, Field

MAX_DURATION_SECONDS = 600
MAX_BYTES = 200 * 1024 * 1024
SUPPORTED_HOST_SUFFIXES = (
    "douyin.com", "iesdouyin.com", "bilibili.com", "b23.tv", "kuaishou.com",
    "xiaohongshu.com", "xhslink.com", "channels.weixin.qq.com", "weixin110.qq.com",
    "youtube.com", "youtu.be",
)
DB_PATH = Path(os.getenv("JOB_DB_PATH", "/data/jobs.sqlite3"))
WORK_DIR = Path(os.getenv("WORK_DIR", "/data/work"))
API_KEY = os.getenv("VIDEO_EXTRACTOR_API_KEY", "")
EXECUTOR = ThreadPoolExecutor(max_workers=max(1, int(os.getenv("EXTRACTOR_WORKERS", "2"))))
DB_LOCK = threading.Lock()
MODEL_LOCK = threading.Lock()
WHISPER_MODEL = None


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


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with DB_LOCK, connect() as db:
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
        db.execute("UPDATE jobs SET status = 'failed', error_message = '提取服务重启，请重新提交任务。', updated_at = CURRENT_TIMESTAMP WHERE status IN ('queued', 'extracting')")


def require_api_key(authorization: str | None = Header(default=None)):
    if not API_KEY or not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="unauthorized")
    if not secrets.compare_digest(authorization[7:].strip(), API_KEY):
        raise HTTPException(status_code=401, detail="unauthorized")


def assert_public_url(value: str):
    return _assert_public_network(value, reject_media=True)


def _assert_public_network(value: str, reject_media: bool):
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("只支持公开的 HTTP/HTTPS 视频分享链接。")
    if reject_media and parsed.path.lower().endswith((".mp4", ".mov", ".m4v", ".webm", ".m3u8", ".mp3", ".m4a", ".wav")):
        raise ValueError("请提供视频分享页，不要提供媒体文件直链。")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as error:
        raise ValueError("视频地址无法解析到公网 IP。") from error
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("视频地址必须解析到公网 IP。")
    return value


def assert_supported_share_url(value: str):
    assert_public_url(value)
    hostname = (urlparse(value).hostname or "").lower()
    if not any(hostname == suffix or hostname.endswith(f".{suffix}") for suffix in SUPPORTED_HOST_SUFFIXES):
        raise ValueError("暂不支持这个视频平台。")
    return value


def update_job(job_id: str, status: str, result: dict | None = None, error: str | None = None):
    with DB_LOCK, connect() as db:
        db.execute(
            "UPDATE jobs SET status = ?, result_json = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (status, json.dumps(result, ensure_ascii=False) if result else None, error, job_id),
        )


def whisper_model():
    global WHISPER_MODEL
    with MODEL_LOCK:
        if WHISPER_MODEL is None:
            WHISPER_MODEL = WhisperModel(
                os.getenv("WHISPER_MODEL", "small"),
                device=os.getenv("WHISPER_DEVICE", "cpu"),
                compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
            )
    return WHISPER_MODEL


async def download_with_f2(url: str, target: Path, max_bytes: int):
    from f2.apps.douyin.handler import DouyinHandler
    from f2.apps.douyin.utils import AwemeIdFetcher

    aweme_id = await AwemeIdFetcher.get_aweme_id(url)
    video = await DouyinHandler({
        "headers": {"User-Agent": "Mozilla/5.0", "Referer": "https://www.douyin.com/"},
        "cookie": os.getenv("DOUYIN_COOKIE", ""),
        "proxies": {"http://": None, "https://": None},
    }).fetch_one_video(aweme_id=aweme_id)
    duration = int((video.duration or 0) / 1000)
    if duration > MAX_DURATION_SECONDS:
        raise ValueError("视频超过10分钟，暂不支持自动收录。")
    media_url = video.video_play_addr if isinstance(video.video_play_addr, str) else next(iter(video.video_play_addr or []), None)
    if not media_url:
        raise ValueError("抖音公开视频地址解析失败。")
    _assert_public_network(media_url, reject_media=False)
    size = 0
    async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
        async with client.stream("GET", media_url, headers={"Referer": "https://www.douyin.com/"}) as response:
            response.raise_for_status()
            with target.open("wb") as output:
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > max_bytes:
                        raise ValueError("视频超过200MB，暂不支持自动收录。")
                    output.write(chunk)
    return {"title": video.desc or None, "coverUrl": video.cover or None, "durationSeconds": duration, "mediaSizeBytes": size}


def download_with_ytdlp(url: str, directory: Path, max_duration: int, max_bytes: int):
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


def transcribe(media_path: Path):
    segments, _ = whisper_model().transcribe(str(media_path), vad_filter=True, beam_size=5)
    transcript = "".join(segment.text.strip() for segment in segments).strip()
    if not transcript:
        raise ValueError("视频中没有识别到可用语音。")
    return transcript


def process_job(job_id: str, request: JobRequest):
    update_job(job_id, "extracting")
    try:
        assert_supported_share_url(request.url)
        WORK_DIR.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=f"{job_id}-", dir=WORK_DIR) as temp_dir:
            directory = Path(temp_dir)
            parsed_host = (urlparse(request.url).hostname or "").lower()
            if "douyin.com" in parsed_host and os.getenv("F2_DOUYIN_ENABLED", "true").lower() == "true":
                try:
                    media_path = directory / "media.mp4"
                    metadata = asyncio.run(download_with_f2(request.url, media_path, request.maxBytes))
                except Exception:
                    media_path, metadata = download_with_ytdlp(request.url, directory, request.maxDurationSeconds, request.maxBytes)
            else:
                media_path, metadata = download_with_ytdlp(request.url, directory, request.maxDurationSeconds, request.maxBytes)
            metadata["transcript"] = transcribe(media_path)
            update_job(job_id, "completed", metadata)
    except Exception as error:
        update_job(job_id, "failed", error=str(error)[:2000])


def schedule(job_id: str, request: JobRequest):
    EXECUTOR.submit(process_job, job_id, request)


initialize_database()
app = FastAPI(title="Mingyuan Video Extractor", version="0.1.0")


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/jobs", response_model=JobResponse, status_code=202, dependencies=[Depends(require_api_key)])
def create_job(request: JobRequest):
    try:
        assert_supported_share_url(request.url)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    job_id = str(uuid.uuid4())
    with DB_LOCK, connect() as db:
        db.execute("INSERT INTO jobs (id, source_url, status) VALUES (?, ?, 'queued')", (job_id, request.url))
    schedule(job_id, request)
    return JobResponse(status="extracting", jobId=job_id)


@app.get("/jobs/{job_id}", response_model=JobResponse, dependencies=[Depends(require_api_key)])
def get_job(job_id: str):
    with connect() as db:
        row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="job not found")
    result = json.loads(row["result_json"]) if row["result_json"] else {}
    return JobResponse(status=row["status"], jobId=job_id, errorMessage=row["error_message"], **result)
