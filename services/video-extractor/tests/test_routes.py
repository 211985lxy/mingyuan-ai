"""路由层测试：健康检查、鉴权、参数校验、创建/查询任务、重启丢任务逻辑。

通过注入 DummyExecutor（同步执行）+ monkeypatch process_job（只写库不下载/转写），
使路由成功路径可在不装 whisper/f2/yt-dlp、不联网的情况下被完整验证。
"""

import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import create_app, connect


class DummyExecutor:
    def submit(self, fn, *args, **kwargs):
        fn(*args, **kwargs)


def make_app(settings):
    return create_app(settings=settings, executor=DummyExecutor(), init_db=True)


def auth_headers():
    return {"Authorization": "Bearer test-key"}


def test_healthz(settings):
    client = TestClient(make_app(settings))
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_missing_api_key(settings):
    client = TestClient(make_app(settings))
    r = client.post("/jobs", json={"url": "https://www.douyin.com/x"})
    assert r.status_code == 401


def test_wrong_api_key(settings):
    client = TestClient(make_app(settings))
    r = client.post(
        "/jobs",
        json={"url": "https://www.douyin.com/x"},
        headers={"Authorization": "Bearer wrong"},
    )
    assert r.status_code == 401


def test_unsupported_url_returns_400(settings):
    client = TestClient(make_app(settings))
    r = client.post(
        "/jobs",
        json={"url": "https://www.example.com/x"},
        headers=auth_headers(),
    )
    assert r.status_code == 400


def test_create_and_get_job(settings, monkeypatch):
    def fake_process_job(job_id, request, s):
        m.update_job(job_id, "completed", {"transcript": "测试转写文本"}, settings=s)

    monkeypatch.setattr(m, "process_job", fake_process_job)
    client = TestClient(make_app(settings))
    r = client.post(
        "/jobs",
        json={"url": "https://www.douyin.com/x"},
        headers=auth_headers(),
    )
    assert r.status_code == 202
    job_id = r.json()["jobId"]
    assert r.json()["status"] == "extracting"

    g = client.get(f"/jobs/{job_id}", headers=auth_headers())
    assert g.status_code == 200
    body = g.json()
    assert body["status"] == "completed"
    assert body["transcript"] == "测试转写文本"


def test_get_missing_job_returns_404(settings):
    client = TestClient(make_app(settings))
    r = client.get("/jobs/nonexistent", headers=auth_headers())
    assert r.status_code == 404


def test_init_db_marks_in_flight_jobs_failed(settings):
    # 先建表（无数据）
    create_app(settings=settings, executor=DummyExecutor(), init_db=True)
    # 插入一条在飞任务，模拟部署前的 queued 状态
    with m.DB_LOCK, connect(settings) as db:
        db.execute(
            "INSERT INTO jobs (id, source_url, status) VALUES (?, ?, 'queued')",
            ("old-job", "https://www.douyin.com/x"),
        )
    # 新实例 init_db=True 应把 queued 标记为 failed（重启丢任务）
    client = TestClient(make_app(settings))
    g = client.get("/jobs/old-job", headers=auth_headers())
    assert g.status_code == 200
    assert g.json()["status"] == "failed"
