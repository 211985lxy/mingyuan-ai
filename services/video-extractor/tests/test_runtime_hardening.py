"""运行期加固测试：模型缓存键 / 转写参数外提 / 幻觉埋点 / 失败日志 / Key 自检。

四组断言各对应一个**此前静默**的缺陷或缺口：

1. ``whisper_model`` 配置冻结 —— 原实现只在全局变量为 ``None`` 时构建，之后
   无论传入什么 settings 都返回旧实例，且不报错；metrics 却按**新** settings 汇报，
   于是"看板写 cuda+float16、实际跑 cpu+int8"这种情况无法被任何人发现。
2. 转写参数（``beam_size`` / ``vad_filter``）硬编码，现场没有排查开关。
3. ``compression_ratio`` 无埋点 —— 复读/幻觉片段最早期的信号反而没进指标。
4. 任务失败只有 DB 里的 ``error_message``，服务端日志零信号；
   以及 API Key 是占位符/未配置时没有任何启动期提示。
"""

import logging
import socket
import sys
import types
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

import app.main as m
from app.main import (
    JobRequest,
    Settings,
    audit_api_key,
    connect,
    create_app,
    enforce_api_key_policy,
    process_job,
    transcribe,
    whisper_model,
)


class FakeSegment:
    def __init__(self, text, avg_logprob=-0.4, no_speech_prob=0.05, compression_ratio=None):
        self.text = text
        self.avg_logprob = avg_logprob
        self.no_speech_prob = no_speech_prob
        if compression_ratio is not None:
            self.compression_ratio = compression_ratio


class FakeInfo:
    language = "zh"
    language_probability = 0.98
    duration = 10.0
    duration_after_vad = 9.0


class RecordingModel:
    """记录 ``transcribe`` 收到的关键字参数，用于断言配置真的透传到了模型层。"""

    def __init__(self, *args, **kwargs):
        self.init_args = args
        self.init_kwargs = kwargs
        self.transcribe_kwargs: dict | None = None

    def transcribe(self, path, **kwargs):
        self.transcribe_kwargs = kwargs
        return [FakeSegment("你好世界", compression_ratio=2.5)], FakeInfo()


def _install_fake_faster_whisper(monkeypatch, factory=None):
    """把 ``faster_whisper`` 塞进 ``sys.modules``。

    生产代码在函数内 ``from faster_whisper import WhisperModel``（惰性导入，
    避免无 GPU 环境导入即失败），所以替身必须装在模块表里而不是 patch 名字。
    """
    created: list = []

    class _Model(RecordingModel):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            created.append(self)

    module = types.ModuleType("faster_whisper")
    module.WhisperModel = factory or _Model
    monkeypatch.setitem(sys.modules, "faster_whisper", module)
    # 缓存是模块级全局，必须逐个用例清空，否则用例之间互相污染。
    monkeypatch.setattr(m, "_MODEL_CACHE", None)
    return created


def _settings(tmp_path, **overrides):
    base = dict(
        JOB_DB_PATH=str(tmp_path / "jobs.sqlite3"),
        WORK_DIR=str(tmp_path / "work"),
        VIDEO_EXTRACTOR_API_KEY="test-key",
        EXTRACTOR_WORKERS="1",
        F2_DOUYIN_ENABLED="false",
    )
    base.update(overrides)
    return Settings(**base)


# ---------------------------------------------------------------------------
# 1. 模型缓存键：同配置复用、异配置重建
# ---------------------------------------------------------------------------

def test_same_config_reuses_single_model_instance(tmp_path, monkeypatch):
    created = _install_fake_faster_whisper(monkeypatch)
    s = _settings(tmp_path)
    first = whisper_model(s)
    second = whisper_model(s)
    assert first is second
    assert len(created) == 1, "同配置重复取用不应重复加载模型"


def test_changed_device_rebuilds_model(tmp_path, monkeypatch):
    created = _install_fake_faster_whisper(monkeypatch)
    cpu = whisper_model(_settings(tmp_path, WHISPER_DEVICE="cpu", WHISPER_COMPUTE_TYPE="int8"))
    cuda = whisper_model(_settings(tmp_path, WHISPER_DEVICE="cuda", WHISPER_COMPUTE_TYPE="float16"))
    assert cpu is not cuda, "设备/精度变了必须重建，否则静默用错设备"
    assert len(created) == 2
    assert cuda.init_kwargs["device"] == "cuda"
    assert cuda.init_kwargs["compute_type"] == "float16"


def test_changed_model_size_rebuilds_model(tmp_path, monkeypatch):
    created = _install_fake_faster_whisper(monkeypatch)
    small = whisper_model(_settings(tmp_path, WHISPER_MODEL="small"))
    large = whisper_model(_settings(tmp_path, WHISPER_MODEL="large-v3"))
    assert small is not large
    assert large.init_args[0] == "large-v3"


def test_decode_only_params_do_not_rebuild_model(tmp_path, monkeypatch):
    """beam_size / vad_filter 是解码参数，不属于模型构造键 —— 改它们不该重载模型。"""
    created = _install_fake_faster_whisper(monkeypatch)
    base = whisper_model(_settings(tmp_path, WHISPER_BEAM_SIZE="5", WHISPER_VAD_FILTER="true"))
    tuned = whisper_model(_settings(tmp_path, WHISPER_BEAM_SIZE="1", WHISPER_VAD_FILTER="false"))
    assert base is tuned
    assert len(created) == 1


def test_reverted_fix_would_freeze_configuration(tmp_path, monkeypatch):
    """回归护栏：把修复退回"仅在 None 时构建"，本用例必须失败。

    这是变异验证的固化形式 —— 断言确实能区分"修好了"与"配置被冻结"。
    """
    created = _install_fake_faster_whisper(monkeypatch)
    whisper_model(_settings(tmp_path, WHISPER_DEVICE="cpu"))
    cuda = whisper_model(_settings(tmp_path, WHISPER_DEVICE="cuda"))
    assert cuda.init_kwargs["device"] == "cuda", "配置被首次调用冻结了"


# ---------------------------------------------------------------------------
# 2. 转写参数外提
# ---------------------------------------------------------------------------

def test_transcribe_passes_default_decode_params(tmp_path, monkeypatch):
    model = RecordingModel()
    monkeypatch.setattr(m, "whisper_model", lambda s=None: model)
    transcribe("dummy.mp4", _settings(tmp_path))
    assert model.transcribe_kwargs["beam_size"] == 5
    assert model.transcribe_kwargs["vad_filter"] is True


def test_transcribe_passes_configured_decode_params(tmp_path, monkeypatch):
    model = RecordingModel()
    monkeypatch.setattr(m, "whisper_model", lambda s=None: model)
    transcribe("dummy.mp4", _settings(tmp_path, WHISPER_BEAM_SIZE="1", WHISPER_VAD_FILTER="false"))
    assert model.transcribe_kwargs["beam_size"] == 1
    assert model.transcribe_kwargs["vad_filter"] is False


def test_metrics_agree_with_params_actually_sent_to_model(tmp_path, monkeypatch):
    """metrics 是运维判断"这次结果为什么不一样"的依据，必须与模型**实收**参数一致。

    只断言 metrics 里出现了某个数字是自证 —— 变异验证时发现：把透传改回硬编码
    `beam_size=5`，这种断言照样通过（metrics 读的是配置值）。故必须拿模型实收
    kwargs 做对照，一旦透传断链，两边不一致即暴露。
    """
    model = RecordingModel()
    monkeypatch.setattr(m, "whisper_model", lambda s=None: model)
    _, metrics = transcribe(
        "dummy.mp4", _settings(tmp_path, WHISPER_BEAM_SIZE="2", WHISPER_VAD_FILTER="false")
    )
    assert metrics["beam_size"] == model.transcribe_kwargs["beam_size"] == 2
    assert metrics["vad_filter"] == model.transcribe_kwargs["vad_filter"] is False


def test_metrics_device_matches_model_construction(tmp_path, monkeypatch):
    """同上的构造侧版本：metrics 报的 device/precision/model 必须是模型真正被构造时的值。"""
    created = _install_fake_faster_whisper(monkeypatch)
    settings = _settings(
        tmp_path, WHISPER_MODEL="large-v3", WHISPER_DEVICE="cuda", WHISPER_COMPUTE_TYPE="float16"
    )
    _, metrics = transcribe("dummy.mp4", settings)
    model = created[0]
    assert metrics["device"] == model.init_kwargs["device"] == "cuda"
    assert metrics["compute_type"] == model.init_kwargs["compute_type"] == "float16"
    assert metrics["model"] == model.init_args[0] == "large-v3"


# ---------------------------------------------------------------------------
# 3. compression_ratio 埋点
# ---------------------------------------------------------------------------

def test_compression_ratio_is_averaged(tmp_path, monkeypatch):
    class Model:
        def transcribe(self, path, **kwargs):
            return [
                FakeSegment("一段话", compression_ratio=1.0),
                FakeSegment("另一段话", compression_ratio=3.0),
            ], FakeInfo()

    monkeypatch.setattr(m, "whisper_model", lambda s=None: Model())
    _, metrics = transcribe("dummy.mp4", _settings(tmp_path))
    assert metrics["compression_ratio"] == 2.0


def test_compression_ratio_is_none_when_model_does_not_report_it(tmp_path, monkeypatch):
    """字段缺失必须记 None，不能记 0.0 —— 0.0 会被看板读成"确有该值且为零"。"""
    class Model:
        def transcribe(self, path, **kwargs):
            return [FakeSegment("一段话")], FakeInfo()

    monkeypatch.setattr(m, "whisper_model", lambda s=None: Model())
    _, metrics = transcribe("dummy.mp4", _settings(tmp_path))
    assert metrics["compression_ratio"] is None
    assert "compression_ratio" in metrics


# ---------------------------------------------------------------------------
# 4a. 失败日志（脱敏 + 可关联）
# ---------------------------------------------------------------------------

def _seed_job(settings, job_id, url="https://www.douyin.com/video/1"):
    m.initialize_database(settings)
    with m.DB_LOCK, connect(settings) as db:
        db.execute(
            "INSERT INTO jobs (id, source_url, status) VALUES (?, ?, 'queued')",
            (job_id, url),
        )


def test_process_job_failure_emits_scrubbed_server_log(tmp_path, monkeypatch, caplog):
    settings = _settings(tmp_path)
    _seed_job(settings, "job-log")
    caplog.set_level(logging.ERROR, logger="mingyuan.video_extractor.jobs")

    leaky = (
        "download failed for https://cdn.example.com/media.mp4?token=SUPERSECRET123 "
        "referer=https://www.douyin.com/ ; work dir /data/work/job-log-abc/media.mp4"
    )

    def boom(_url):
        raise ValueError(leaky)

    monkeypatch.setattr(m, "assert_supported_share_url", boom)
    process_job("job-log", JobRequest(url="https://www.douyin.com/video/1"), settings)

    records = [r for r in caplog.records if r.name == "mingyuan.video_extractor.jobs"]
    assert records, "任务失败必须在服务端留下日志（此前零信号）"
    text = records[0].getMessage()
    assert "job-log" in text, "日志必须带上 job_id 才能与具体任务对上"
    assert "SUPERSECRET123" not in text, "日志里的 URL 令牌必须脱敏"
    assert "token=REDACTED" in text
    assert "/data/work" not in text, "日志里的绝对路径必须脱敏"


def test_process_job_failure_still_persists_scrubbed_error(tmp_path, monkeypatch):
    """日志新增不能改变 DB 侧既有行为：回显文案仍要保留业务提示。"""
    settings = _settings(tmp_path)
    _seed_job(settings, "job-log-db")

    def boom(_url):
        raise ValueError("视频超过10分钟，暂不支持自动收录。")

    monkeypatch.setattr(m, "assert_supported_share_url", boom)
    process_job("job-log-db", JobRequest(url="https://www.douyin.com/video/1"), settings)

    with connect(settings) as db:
        row = db.execute("SELECT status, error_message FROM jobs WHERE id='job-log-db'").fetchone()
    assert row["status"] == "failed"
    assert row["error_message"] == "视频超过10分钟，暂不支持自动收录。"


# ---------------------------------------------------------------------------
# 4b. API Key 启动自检
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "key,expected",
    [
        ("", "api_key_unset"),
        ("change-me", "api_key_placeholder"),
        ("change-me", "api_key_placeholder"),
        ("test-key", "api_key_placeholder"),
        ("  Change-Me  ", "api_key_placeholder"),
        ("placeholder", "api_key_placeholder"),
        ("short", "api_key_weak"),
        ("a" * 15, "api_key_weak"),
        ("a" * 16, None),
        ("f3a9" * 16, None),
    ],
)
def test_audit_api_key_classifies(key, expected):
    assert audit_api_key(Settings(VIDEO_EXTRACTOR_API_KEY=key)) == expected


def test_audit_api_key_reads_env_when_unset(monkeypatch):
    monkeypatch.delenv("VIDEO_EXTRACTOR_API_KEY", raising=False)
    assert audit_api_key(Settings()) == "api_key_unset"


def test_enforcement_warns_by_default_and_starts(caplog):
    caplog.set_level(logging.WARNING, logger="mingyuan.video_extractor.security")
    enforce_api_key_policy(Settings(VIDEO_EXTRACTOR_API_KEY="change-me"))  # 不应抛错
    messages = [r.getMessage() for r in caplog.records]
    assert any("api_key_placeholder" in message for message in messages)


def test_enforcement_rejects_placeholder_in_strict_mode():
    settings = Settings(VIDEO_EXTRACTOR_API_KEY="change-me", VIDEO_EXTRACTOR_STRICT_KEY="true")
    with pytest.raises(RuntimeError, match="api_key_placeholder"):
        enforce_api_key_policy(settings)


def test_enforcement_allows_strong_key_in_strict_mode():
    settings = Settings(VIDEO_EXTRACTOR_API_KEY="f3a9" * 16, VIDEO_EXTRACTOR_STRICT_KEY="true")
    enforce_api_key_policy(settings)  # 不应抛错


def test_create_app_inherits_strict_policy(monkeypatch, tmp_path):
    _patch_dns(monkeypatch)
    monkeypatch.setattr(m, "process_job", lambda *a, **k: None)
    settings = _settings(
        tmp_path,
        VIDEO_EXTRACTOR_API_KEY="change-me",
        VIDEO_EXTRACTOR_STRICT_KEY="true",
    )
    with pytest.raises(RuntimeError):
        create_app(settings=settings, init_db=True)


def test_create_app_works_with_placeholder_key_by_default(monkeypatch, tmp_path):
    _patch_dns(monkeypatch)
    monkeypatch.setattr(m, "process_job", lambda *a, **k: None)
    settings = _settings(tmp_path)
    app = create_app(settings=settings, executor=ThreadPoolExecutor(max_workers=1), init_db=True)
    client = TestClient(app)
    assert client.get("/healthz").status_code == 200
    app.state.executor.shutdown(wait=False)


def _patch_dns(monkeypatch, ips=("8.8.8.8",)):
    def fake(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", (ip, port or 443)) for ip in ips]
    monkeypatch.setattr(socket, "getaddrinfo", fake)
