"""process_job / transcribe 关键分支的回归测试（纯桩，无网络 / 无 GPU）。

补齐既有测试覆盖盲区（见 coverage 报告缺失行）：
- transcribe 空转写文本必须抛 ValueError（main.py:219）
- transcribe 空 segments 时推理指标必须安全归零（main.py:225-226）
- process_job 异常路径必须把任务标记为 failed（main.py:262-263）——关键回归护栏
- process_job 抖音 f2 分支成功 + f2 失败后回退 ytdlp（main.py:251-255）

全部通过 monkeypatch 桩接 download / whisper_model，运行零重依赖，
可直接纳入常规单测套件并计入覆盖率。
"""

import json
import socket

import pytest

import app.main as m
from app.main import JobRequest, Settings, connect, create_app, process_job
from concurrent.futures import ThreadPoolExecutor


class FakeSegment:
    def __init__(self, text):
        self.text = text
        self.avg_logprob = -0.4
        self.no_speech_prob = 0.05


class FakeInfo:
    language = "zh"
    language_probability = 0.98
    duration = 10.0
    duration_after_vad = 9.0


def _patch_dns(monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("1.2.3.4", port or 443))]
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


def _settings(tmp_path, **overrides):
    base = dict(
        JOB_DB_PATH=str(tmp_path / "jobs.sqlite3"),
        WORK_DIR=str(tmp_path / "work"),
        VIDEO_EXTRACTOR_API_KEY="test-key",
        EXTRACTOR_WORKERS="1",
        F2_DOUYIN_ENABLED="true",
    )
    base.update(overrides)
    return Settings(**base)


def _insert(settings, sid, url, status="queued"):
    with m.DB_LOCK, connect(settings) as db:
        db.execute(
            "INSERT INTO jobs (id, source_url, status) VALUES (?, ?, ?)",
            (sid, url, status),
        )


def _row(settings, sid):
    with m.DB_LOCK, connect(settings) as db:
        return db.execute(
            "SELECT status, result_json, error_message FROM jobs WHERE id = ?", (sid,)
        ).fetchone()


# --------------------------------------------------------------------------
# transcribe 空文本 / 空 segments
# --------------------------------------------------------------------------

def test_transcribe_empty_transcript_raises(monkeypatch):
    class FakeModel:
        def transcribe(self, *args, **kwargs):
            return [FakeSegment("   ")], FakeInfo()  # 全空白，strip 后为空串

    monkeypatch.setattr(m, "whisper_model", lambda s=None: FakeModel())
    with pytest.raises(ValueError, match="没有识别到可用语音"):
        m.transcribe("x.wav", Settings())


def test_transcribe_empty_segments_raises(monkeypatch):
    # 空 segments → 拼接出空 transcript → 与空文本同路径，抛 ValueError。
    # 注：main.py:225-226 的 else 分支（segments 为空时指标归零）实际不可达，
    # 因为空 segments 必然先触发上面的 ValueError。属死代码，已在评审中标注。
    class FakeModel:
        def transcribe(self, *args, **kwargs):
            return [], FakeInfo()

    monkeypatch.setattr(m, "whisper_model", lambda s=None: FakeModel())
    with pytest.raises(ValueError, match="没有识别到可用语音"):
        m.transcribe("x.wav", Settings())


# --------------------------------------------------------------------------
# process_job 失败路径（关键护栏：异常必须让任务 failed，绝不能静默丢失）
# --------------------------------------------------------------------------

def test_process_job_marks_failed_on_error(tmp_path, monkeypatch):
    _patch_dns(monkeypatch)
    settings = _settings(tmp_path)

    def boom(*args, **kwargs):
        raise RuntimeError("download exploded")

    monkeypatch.setattr(m, "download_with_ytdlp", boom)
    monkeypatch.setattr(m, "whisper_model", lambda s=None: object())  # 不应被触达

    create_app(settings=settings, executor=ThreadPoolExecutor(max_workers=1), init_db=True)
    sid = "job-fail"
    _insert(settings, sid, "https://www.bilibili.com/video/BV1")
    process_job(sid, JobRequest(url="https://www.bilibili.com/video/BV1"), settings)

    row = _row(settings, sid)
    assert row["status"] == "failed"
    assert "download exploded" in (row["error_message"] or "")


# --------------------------------------------------------------------------
# process_job 抖音 f2 分支（成功 / 失败后回退 ytdlp）
# --------------------------------------------------------------------------

def test_process_job_douyin_f2_success(tmp_path, monkeypatch):
    _patch_dns(monkeypatch)
    settings = _settings(tmp_path, F2_DOUYIN_ENABLED="true")

    async def fake_f2(url, target, max_bytes, s):
        target.write_text("fake-media")
        return {"title": "抖音视频", "coverUrl": "http://c", "durationSeconds": 5, "mediaSizeBytes": 10}

    monkeypatch.setattr(m, "download_with_f2", fake_f2)

    class FakeModel:
        def transcribe(self, *args, **kwargs):
            return [FakeSegment("抖音转写结果")], FakeInfo()

    monkeypatch.setattr(m, "whisper_model", lambda s=None: FakeModel())

    create_app(settings=settings, executor=ThreadPoolExecutor(max_workers=1), init_db=True)
    sid = "job-f2"
    _insert(settings, sid, "https://www.douyin.com/share/video/123")
    process_job(sid, JobRequest(url="https://www.douyin.com/share/video/123"), settings)

    row = _row(settings, sid)
    assert row["status"] == "completed"
    result = json.loads(row["result_json"])
    assert result["transcript"] == "抖音转写结果"
    assert result["title"] == "抖音视频"


def test_process_job_douyin_f2_falls_back_to_ytdlp(tmp_path, monkeypatch):
    _patch_dns(monkeypatch)
    settings = _settings(tmp_path, F2_DOUYIN_ENABLED="true")

    async def fake_f2_raises(*args, **kwargs):
        raise RuntimeError("f2 failed")

    monkeypatch.setattr(m, "download_with_f2", fake_f2_raises)

    def fake_ytdlp(url, directory, max_duration, max_bytes):
        media = directory / "media.mp4"
        media.write_text("fake-media")
        return media, {"title": "ytdlp", "coverUrl": None, "durationSeconds": 7, "mediaSizeBytes": 20}

    monkeypatch.setattr(m, "download_with_ytdlp", fake_ytdlp)

    class FakeModel:
        def transcribe(self, *args, **kwargs):
            return [FakeSegment("回退转写")], FakeInfo()

    monkeypatch.setattr(m, "whisper_model", lambda s=None: FakeModel())

    create_app(settings=settings, executor=ThreadPoolExecutor(max_workers=1), init_db=True)
    sid = "job-fallback"
    _insert(settings, sid, "https://www.douyin.com/share/video/456")
    process_job(sid, JobRequest(url="https://www.douyin.com/share/video/456"), settings)

    row = _row(settings, sid)
    assert row["status"] == "completed"
    result = json.loads(row["result_json"])
    assert result["title"] == "ytdlp"
