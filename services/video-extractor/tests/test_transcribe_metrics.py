"""GPU 推理质量埋点测试。

验证 transcribe 返回的推理指标（device / compute_type / chars_per_second /
avg_logprob / no_speech_prob）能被 process_job 持久化进 job 结果，使线上
whisper 回退（如 cuda→cpu、float16→int8）从"看不见"变成"可观测"。
通过 monkeypatch whisper_model 与下载函数，完全不依赖真实模型与网络。
"""

import json
import socket

import pytest

import app.main as m
from app.main import JobRequest, Settings, connect, create_app, process_job
from concurrent.futures import ThreadPoolExecutor


class FakeSegment:
    def __init__(self, text, avg_logprob=-0.4, no_speech_prob=0.05):
        self.text = text
        self.avg_logprob = avg_logprob
        self.no_speech_prob = no_speech_prob


class FakeInfo:
    language = "zh"
    language_probability = 0.98
    duration = 10.0
    duration_after_vad = 9.0


class FakeModel:
    def transcribe(self, *args, **kwargs):
        return [FakeSegment("你好世界"), FakeSegment("这是质量埋点测试")], FakeInfo()


def _patch_dns(monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("1.2.3.4", port or 443))]
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


def _settings(tmp_path, **overrides):
    base = dict(
        JOB_DB_PATH=str(tmp_path / "jobs.sqlite3"),
        WORK_DIR=str(tmp_path / "work"),
        VIDEO_EXTRACTOR_API_KEY="test-key",
        WHISPER_DEVICE="cuda",
        WHISPER_COMPUTE_TYPE="float16",
        WHISPER_MODEL="small",
        EXTRACTOR_WORKERS="1",
    )
    base.update(overrides)
    return Settings(**base)


def test_transcribe_returns_metrics(monkeypatch):
    monkeypatch.setattr(m, "whisper_model", lambda s=None: FakeModel())
    settings = Settings(
        JOB_DB_PATH="/tmp/x.sqlite3", WORK_DIR="/tmp/w", WHISPER_DEVICE="cuda",
        WHISPER_COMPUTE_TYPE="float16", WHISPER_MODEL="small",
    )
    transcript, metrics = m.transcribe("dummy.mp4", settings)
    assert transcript == "你好世界这是质量埋点测试"
    assert metrics["device"] == "cuda"
    assert metrics["compute_type"] == "float16"
    assert metrics["chars_per_second"] > 0
    assert "avg_logprob" in metrics and "no_speech_prob" in metrics


def test_process_job_persists_metrics(tmp_path, monkeypatch):
    _patch_dns(monkeypatch)
    settings = _settings(tmp_path)
    monkeypatch.setattr(m, "whisper_model", lambda s=None: FakeModel())

    def fake_download(url, directory, max_duration, max_bytes):
        return directory / "media.mp4", {
            "title": "t", "coverUrl": None, "durationSeconds": 9, "mediaSizeBytes": 100,
        }
    monkeypatch.setattr(m, "download_with_ytdlp", fake_download)

    create_app(settings=settings, executor=ThreadPoolExecutor(max_workers=1), init_db=True)
    req = JobRequest(url="https://www.bilibili.com/video/BV123")
    # process_job 仅 UPDATE，前提是该 job 已由 create_job 路由 INSERT 进表
    with m.DB_LOCK, connect(settings) as db:
        db.execute(
            "INSERT INTO jobs (id, source_url, status) VALUES (?, ?, 'queued')",
            ("job-metrics", req.url),
        )
    process_job("job-metrics", req, settings)

    with m.DB_LOCK, connect(settings) as db:
        row = db.execute("SELECT result_json FROM jobs WHERE id='job-metrics'").fetchone()
    result = json.loads(row["result_json"])
    assert result["transcript"] == "你好世界这是质量埋点测试"
    assert result["metrics"]["device"] == "cuda"
    assert result["metrics"]["compute_type"] == "float16"
    assert result["metrics"]["chars_per_second"] > 0
    assert "avg_logprob" in result["metrics"]
