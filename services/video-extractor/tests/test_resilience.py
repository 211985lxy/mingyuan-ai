"""运营加固测试：F3 限流 / F6 磁盘熔断（P1 弹性，与 SSRF 正交）。

- F3 限流：每 API Key 令牌桶，超出配额返回 429；RATE_LIMIT_PER_MINUTE=0 关闭限制。
- F6 磁盘熔断：work_dir 剩余空间低于阈值时 process_job 直接判失败，不进入下载。
"""

import shutil
import socket

import pytest
from fastapi.testclient import TestClient

import app.main as main_mod
from app.main import Settings, create_app, RateLimiter, _check_disk_budget


def _patch_dns(monkeypatch, ips=("8.8.8.8",)):
    def fake(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", (ip, port or 443)) for ip in ips]
    monkeypatch.setattr(socket, "getaddrinfo", fake)


# --------------------------------------------------------------------------
# F3 限流单元（确定性时钟）
# --------------------------------------------------------------------------

def test_rate_limiter_allows_capacity_then_denies():
    now = {"t": 0.0}
    rl = RateLimiter(capacity=2, refill_seconds=60, now=lambda: now["t"])
    assert rl.allow("k") is True
    assert rl.allow("k") is True
    assert rl.allow("k") is False
    now["t"] = 30.0  # 半周期补 1 令牌
    assert rl.allow("k") is True
    assert rl.allow("k") is False


def test_rate_limiter_isolates_keys():
    now = {"t": 0.0}
    rl = RateLimiter(capacity=1, now=lambda: now["t"])
    assert rl.allow("a") is True
    assert rl.allow("a") is False
    assert rl.allow("b") is True  # 不同 key 独立计数


# --------------------------------------------------------------------------
# F3 限流 HTTP 行为
# --------------------------------------------------------------------------

def _make_client(monkeypatch, rate_limit):
    _patch_dns(monkeypatch)
    monkeypatch.setattr(main_mod, "process_job", lambda *a, **k: None)  # 后台任务置空，避免真实拉流/转写
    settings = Settings(
        VIDEO_EXTRACTOR_API_KEY="k",
        EXTRACTOR_WORKERS="1",
        F2_DOUYIN_ENABLED="false",
        RATE_LIMIT_PER_MINUTE=str(rate_limit),
    )
    app = create_app(settings=settings, init_db=True)
    return app, TestClient(app)


def test_rate_limit_returns_429_after_capacity(monkeypatch):
    app, client = _make_client(monkeypatch, rate_limit=1)
    first = client.post("/jobs", json={"url": "https://www.douyin.com/video/1"}, headers={"Authorization": "Bearer k"})
    assert first.status_code == 202
    second = client.post("/jobs", json={"url": "https://www.douyin.com/video/2"}, headers={"Authorization": "Bearer k"})
    assert second.status_code == 429
    app.state.executor.shutdown(wait=False)


def test_rate_limit_disabled_when_zero(monkeypatch):
    app, client = _make_client(monkeypatch, rate_limit=0)
    for i in range(5):
        r = client.post("/jobs", json={"url": f"https://www.douyin.com/video/{i}"}, headers={"Authorization": "Bearer k"})
        assert r.status_code == 202, r.status_code
    app.state.executor.shutdown(wait=False)


# --------------------------------------------------------------------------
# F6 磁盘熔断
# --------------------------------------------------------------------------

def test_disk_breaker_raises_when_low(monkeypatch, tmp_path):
    monkeypatch.setattr(shutil, "disk_usage", lambda p: type("U", (), {"free": 10})())
    settings = Settings(WORK_DIR=str(tmp_path / "w"), DISK_MIN_FREE_BYTES=str(1000))
    with pytest.raises(ValueError, match="磁盘"):
        _check_disk_budget(settings)


def test_disk_breaker_passes_when_enough(monkeypatch, tmp_path):
    monkeypatch.setattr(shutil, "disk_usage", lambda p: type("U", (), {"free": 9999})())
    settings = Settings(WORK_DIR=str(tmp_path / "w"), DISK_MIN_FREE_BYTES=str(1000))
    _check_disk_budget(settings)  # 不应抛错


def test_process_job_fails_on_low_disk(monkeypatch, tmp_path):
    # 把下载/转写的网络依赖全部短路，只验证磁盘熔断这条路径。
    monkeypatch.setattr(shutil, "disk_usage", lambda p: type("U", (), {"free": 1})())
    monkeypatch.setattr(main_mod, "assert_supported_share_url", lambda v: v)
    settings = Settings(
        JOB_DB_PATH=str(tmp_path / "j.sqlite3"),
        WORK_DIR=str(tmp_path / "w"),
        VIDEO_EXTRACTOR_API_KEY="k",
        EXTRACTOR_WORKERS="1",
        F2_DOUYIN_ENABLED="false",
        DISK_MIN_FREE_BYTES=str(1000),
    )
    from app.main import JobRequest, initialize_database, process_job

    initialize_database(settings)
    import sqlite3 as _sql

    with _sql.connect(settings.db_path) as db:
        db.execute("INSERT INTO jobs (id, source_url, status) VALUES ('job-x', 'https://www.douyin.com/video/1', 'queued')")
    process_job("job-x", JobRequest(url="https://www.douyin.com/video/1"), settings)

    with _sql.connect(settings.db_path) as db:
        row = db.execute("SELECT status, error_message FROM jobs WHERE id='job-x'").fetchone()
    assert row[0] == "failed"
    assert "磁盘" in (row[1] or "")
