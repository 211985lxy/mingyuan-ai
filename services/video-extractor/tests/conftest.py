"""pytest 共享 fixture。

必须在任何 ``app.main`` 导入前设置环境变量，避免模块级 ``create_app()``
在导入时尝试在 ``/data`` 建库（生产由 Docker ENV 覆盖，测试环境应指向临时路径）。
"""

import os
import tempfile

_TMP_DIR = os.path.join(tempfile.gettempdir(), "video_extractor_test")
os.makedirs(_TMP_DIR, exist_ok=True)
os.environ.setdefault("JOB_DB_PATH", os.path.join(_TMP_DIR, "jobs.sqlite3"))
os.environ.setdefault("WORK_DIR", os.path.join(_TMP_DIR, "work"))
os.environ.setdefault("VIDEO_EXTRACTOR_API_KEY", "test-key")

import warnings

warnings.filterwarnings("ignore", category=ResourceWarning)

import pytest  # noqa: E402

from app.main import Settings, create_app  # noqa: E402


@pytest.fixture
def settings(tmp_path):
    return Settings(
        JOB_DB_PATH=str(tmp_path / "jobs.sqlite3"),
        WORK_DIR=str(tmp_path / "work"),
        VIDEO_EXTRACTOR_API_KEY="test-key",
        EXTRACTOR_WORKERS="1",
        F2_DOUYIN_ENABLED="false",
    )


@pytest.fixture
def app(settings):
    return create_app(settings=settings, init_db=True)
