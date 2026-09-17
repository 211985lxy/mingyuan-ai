"""敏感信息收敛 + 连接生命周期的回归测试（纯桩，无网络 / 无模型）。

覆盖三类此前未被验证的行为：

1. ``connect()`` 生命周期——退出上下文必须**关闭**连接。
   原先直接返回 sqlite3.Connection，``with`` 只提交不关闭，每次请求漏一条连接
   （fd + WAL 句柄），并发下瞬时耗尽 fd。这是 F8/#236 标注的 ResourceWarning 根因。
2. ``_scrub_url`` —— 提交的分享链接常带签名参数，入库前必须去掉令牌值（F9）。
3. ``_scrub_secrets`` —— 异常原文（含 work_dir 绝对路径、上游带令牌 URL）不得原样
   经 ``errorMessage`` 回给调用方（F7）。

刻意保留的边界：**业务提示文案必须原样透出**。本服务大量错误文案是给用户看的
（"视频超过10分钟…"），若图省事统一替换成通用文案，会同时废掉用户提示与排障能力。
故此处用「脱敏」而非「替换」，并显式断言业务文案不被改动。
"""

import sqlite3
import socket

import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import JobRequest, connect, create_app, process_job


def _patch_dns(monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("1.2.3.4", port or 443))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


def _insert(settings, sid, url, status="queued"):
    with m.DB_LOCK, connect(settings) as db:
        db.execute("INSERT INTO jobs (id, source_url, status) VALUES (?, ?, ?)", (sid, url, status))


def _one(settings, sid, column):
    with m.DB_LOCK, connect(settings) as db:
        row = db.execute(f"SELECT {column} FROM jobs WHERE id = ?", (sid,)).fetchone()
    return row[column] if row else None


# --------------------------------------------------------------------------
# 1. connect() 必须关闭连接
# --------------------------------------------------------------------------

def test_connect_closes_connection_on_exit(settings):
    with connect(settings) as db:
        assert db.execute("SELECT 1").fetchone()[0] == 1
    with pytest.raises(sqlite3.ProgrammingError, match="closed"):
        db.execute("SELECT 1")


def test_connect_closes_connection_on_exception(settings):
    holder = {}
    with pytest.raises(RuntimeError):
        with connect(settings) as db:
            holder["db"] = db
            raise RuntimeError("boom in with-block")
    with pytest.raises(sqlite3.ProgrammingError, match="closed"):
        holder["db"].execute("SELECT 1")


def test_connect_does_not_leak_across_repeated_calls(settings):
    """连续开 30 条连接，不应累积未关闭句柄（原先会全部挂着等 GC）。"""
    seen = []
    for _ in range(30):
        with connect(settings) as db:
            seen.append(db)
            db.execute("SELECT 1").fetchone()
    for db in seen:
        with pytest.raises(sqlite3.ProgrammingError, match="closed"):
            db.execute("SELECT 1")


# --------------------------------------------------------------------------
# 2. _scrub_url：入库前去掉签名令牌，保留其余参数
# --------------------------------------------------------------------------

def test_scrub_url_redacts_sensitive_params_and_keeps_benign():
    scrubbed = m._scrub_url("https://www.douyin.com/video/123?token=SECRET123&foo=bar")
    assert "SECRET123" not in scrubbed
    assert f"token={m.REDACTED}" in scrubbed
    assert "foo=bar" in scrubbed


@pytest.mark.parametrize(
    "url",
    [
        "https://x.com/a?expires=1700000000&sign=abcDEF&mod=w",
        "https://x.com/a?X-Bogus=DFSz&ms_token=zzz",
        "https://x.com/a?access_token=aaa&refresh_token=bbb",
        "https://x.com/a?sessionid=deadbeef&sig=zz",
    ],
)
def test_scrub_url_covers_known_sensitive_key_forms(url):
    scrubbed = m._scrub_url(url)
    assert m.REDACTED in scrubbed
    # 每个敏感键的值都必须被替换（不能只替换其中一个）
    for pair in url.split("?", 1)[1].split("&"):
        name, _, value = pair.partition("=")
        if name.lower() in m.SENSITIVE_QUERY_KEYS:
            assert value not in scrubbed, f"{name} 的值未被脱敏"


def test_scrub_url_is_noop_without_query():
    for url in ["https://www.bilibili.com/video/BV1", "https://www.douyin.com/video/9?foo=bar"]:
        assert m._scrub_url(url) == url


# --------------------------------------------------------------------------
# 3. _scrub_secrets：异常原文脱敏，但业务文案必须原样
# --------------------------------------------------------------------------

def test_scrub_secrets_removes_absolute_paths():
    text = m._scrub_secrets("ffmpeg failed reading /private/var/folders/ab/T/tmp123/media.mp4")
    assert "/private/var/folders" not in text
    assert m.REDACTED in text


def test_scrub_secrets_removes_url_tokens_and_paths_together():
    raw = (
        "ERROR: unable to download from "
        "https://v3-web.douyinvod.com/abc?token=SEK&sign=SIG: /data/work/job-x/media.mp4"
    )
    text = m._scrub_secrets(raw)
    assert "SEK" not in text and "SIG" not in text
    assert "/data/work" not in text
    assert m.REDACTED in text


def test_scrub_secrets_removes_bearer_credentials():
    text = m._scrub_secrets("Authentication: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig rejected")
    assert "eyJhbGciOiJIUzI1NiJ9" not in text
    assert "rejected" in text


def test_scrub_secrets_does_not_partially_redact_value_containing_colon():
    """`sign=abc:def` 必须整体脱敏——只脱敏 `abc` 会留下半截密钥。"""
    text = m._scrub_secrets("sign=abc:def next")
    assert "abc" not in text and "def" not in text


@pytest.mark.parametrize(
    "business_message",
    [
        "视频超过10分钟，暂不支持自动收录。",
        "视频超过200MB，暂不支持自动收录。",
        "请提供视频分享页，不要提供媒体文件直链。",
        "视频地址必须解析到公网 IP。",
        "暂时不支持这个视频平台。",
        "磁盘可用空间不足，请稍后再试。",
        "download exploded",
        "HTTP Error 403: Forbidden",
    ],
)
def test_scrub_secrets_preserves_business_messages(business_message):
    assert m._scrub_secrets(business_message) == business_message


def test_scrub_secrets_passes_through_empty_input():
    assert m._scrub_secrets("") == ""


def test_scrub_url_is_noop_on_query_free_and_malformed_input():
    """防御性分支：本函数位于 `create_job` 请求路径，宁可原样返回也不要抛错。"""
    for url in ["https://x.com/a", "https://x.com/a?", "not a url"]:
        assert m._scrub_url(url) == url


# --------------------------------------------------------------------------
# 4. 路由层：提交带令牌的链接，落库副本不得含令牌原文
# --------------------------------------------------------------------------

def test_create_job_persists_scrubbed_source_url(settings, monkeypatch):
    _patch_dns(monkeypatch)
    monkeypatch.setattr(m, "process_job", lambda job_id, request, s: None)

    class DummyExecutor:
        def submit(self, fn, *args, **kwargs):
            fn(*args, **kwargs)

    client = TestClient(create_app(settings=settings, executor=DummyExecutor(), init_db=True))
    submitted = "https://www.douyin.com/video/123?token=SUPERSECRET&foo=bar"
    response = client.post("/jobs", json={"url": submitted}, headers={"Authorization": "Bearer test-key"})
    assert response.status_code == 202

    stored = _one(settings, response.json()["jobId"], "source_url")
    assert "SUPERSECRET" not in stored
    assert f"token={m.REDACTED}" in stored
    assert "foo=bar" in stored


# --------------------------------------------------------------------------
# 5. 任务失败：异常细节脱敏后才落库
# --------------------------------------------------------------------------

def test_process_job_failure_scrubs_error_details(settings, monkeypatch):
    _patch_dns(monkeypatch)

    def boom(*args, **kwargs):
        raise RuntimeError(
            "yt-dlp failed: /data/work/job-x/media.mp4 403 from "
            "https://v3-web.douyinvod.com/abc?sign=TOPSECRET"
        )

    monkeypatch.setattr(m, "download_with_ytdlp", boom)
    m.initialize_database(settings)
    sid = "job-scrub"
    _insert(settings, sid, "https://www.bilibili.com/video/BV1")
    process_job(sid, JobRequest(url="https://www.bilibili.com/video/BV1"), settings)

    stored = _one(settings, sid, "error_message")
    assert _one(settings, sid, "status") == "failed"
    assert "TOPSECRET" not in stored
    assert "/data/work" not in stored
    # 仍保留可排障的部分：异常类型与上游状态码
    assert "yt-dlp failed" in stored
    assert "403" in stored


def test_process_job_failure_keeps_business_message_verbatim(settings, monkeypatch):
    """护栏：业务文案（此处为磁盘熔断）必须原样透出，不被脱敏规则误伤。

    必须打 DNS 桩，否则失败会发生在 `assert_supported_share_url` 的解析环节，
    测到的是"解析失败"而非磁盘熔断路径——会因错的原因通过。
    """
    _patch_dns(monkeypatch)

    def disk_low(s=None):
        raise ValueError("磁盘可用空间不足，请稍后再试。")

    monkeypatch.setattr(m, "_check_disk_budget", disk_low)
    m.initialize_database(settings)
    sid = "job-business"
    _insert(settings, sid, "https://www.bilibili.com/video/BV1")
    process_job(sid, JobRequest(url="https://www.bilibili.com/video/BV1"), settings)

    assert _one(settings, sid, "error_message") == "磁盘可用空间不足，请稍后再试。"
