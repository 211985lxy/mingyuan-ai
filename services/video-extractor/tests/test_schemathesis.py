"""Schemathesis 接口模糊测试（in-process，同进程 ASGI）。

目标：基于 OpenAPI Schema 的属性测试，对 /healthz、/jobs POST、/jobs/{id} GET
做异常 / 边界 / 畸形输入模糊测试，确保服务在任意输入下：
  1) 不会抛出 5xx（not_a_server_error）
  2) 不会触发未处理异常导致进程崩溃

关键约束（防回归到"真下载 + 真转写"）：
  - 使用 DropExecutor：executor.submit 直接丢弃，process_job 永不被调用，
    因此 fuzz 绝不会触发真实下载 / 转写（等价桩）。
  - 防御性地把 download_with_ytdlp / download_with_f2 / whisper_model 也替换为桩，
    即便 fuzz 绕过前置校验也不会联网或加载 GPU 模型（fuzz_stubs fixture）。
  - 全程 in-process ASGI，不触碰网络。

运行条件：需要安装重依赖 ``schemathesis`` + ``hypothesis``（建议独立 qa 环境 / CI job）。
未安装时整个模块被 ``importorskip`` 跳过，不影响常规单测。

    uv pip install -e ".[fuzz]"          # 仅 fuzz 环境
    pytest tests/test_schemathesis.py

注意：路由目前未用 ``responses=`` 声明 400/401/404，OpenAPI schema 只含 202/200。
因此这里显式把 checks 收敛为 ``not_a_server_error``，避免对未文档化的 4xx 误报。
（可选增强：在 app.main 的路由上加 ``responses={400:..., 401:..., 404:...}``，
再把 checks 放开到完整 schema conformance。）
"""

import os
import tempfile

import pytest

# 未安装重依赖时整文件跳过——不影响 22 个常规单测
schemathesis = pytest.importorskip("schemathesis")
pytest.importorskip("hypothesis")

import socket  # noqa: E402

import app.main as m  # noqa: E402
from app.main import Settings, create_app  # noqa: E402


class DropExecutor:
    """丢弃型执行器：submit 直接丢弃，process_job 永不被调用。

    这是防止 fuzz 触发真实下载 / 转写的核心等价桩。
    """

    def submit(self, fn, *args, **kwargs):
        return None


# 固定临时目录，避免污染生产 /data；思路与 conftest 一致
_FUZZ_DIR = tempfile.mkdtemp(prefix="video_extractor_fuzz_")
_FUZZ_SETTINGS = Settings(
    JOB_DB_PATH=os.path.join(_FUZZ_DIR, "jobs.sqlite3"),
    WORK_DIR=os.path.join(_FUZZ_DIR, "work"),
    VIDEO_EXTRACTOR_API_KEY="test-key",
    EXTRACTOR_WORKERS="1",
    F2_DOUYIN_ENABLED="false",
)
# 模块级构建 app + schema（供 parametrize 装饰器在收集期绑定）
fuzz_app = create_app(settings=_FUZZ_SETTINGS, executor=DropExecutor(), init_db=True)
schema = schemathesis.from_fastapi(fuzz_app, validate_schema=False)


@pytest.fixture
def fuzz_stubs(monkeypatch):
    """防御性桩：即便 fuzz 绕过前校验，也不会真下载 / 加载模型。"""
    monkeypatch.setattr(
        m, "download_with_ytdlp",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("fuzz stub: download_with_ytdlp")),
    )
    monkeypatch.setattr(
        m, "download_with_f2",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("fuzz stub: download_with_f2")),
    )
    monkeypatch.setattr(m, "whisper_model", lambda s=None: object())
    # process_job 在 DropExecutor 下不会被调用；此处再保险一层
    def _stub_process_job(job_id, request, s=None):
        m.update_job(
            job_id, "completed",
            {"transcript": "fuzz-stub", "title": "t", "durationSeconds": 1, "mediaSizeBytes": 1},
            settings=s or _FUZZ_SETTINGS,
        )
    monkeypatch.setattr(m, "process_job", _stub_process_job)


@schema["/healthz"]["GET"].parametrize(
    checks=[schemathesis.checks.not_a_server_error],
    hypothesis_settings={"max_examples": 30, "deadline": None},
)
def test_healthz_fuzz(case, fuzz_stubs):
    case.call_and_validate()


@schema["/jobs"]["POST"].parametrize(
    headers={"Authorization": "Bearer test-key"},
    checks=[schemathesis.checks.not_a_server_error],
    hypothesis_settings={"max_examples": 30, "deadline": None},
)
def test_jobs_post_fuzz(case, fuzz_stubs):
    case.call_and_validate()


@schema["/jobs/{job_id}"]["GET"].parametrize(
    headers={"Authorization": "Bearer test-key"},
    checks=[schemathesis.checks.not_a_server_error],
    hypothesis_settings={"max_examples": 30, "deadline": None},
)
def test_jobs_get_fuzz(case, fuzz_stubs):
    case.call_and_validate()
