"""GPU 推理质量回退 CER 门禁。

目标：防止 whisper 回退（如 cuda→cpu、float16→int8、模型版本升级）导致
业务音频转写质量 silently 劣化。核心门禁为「相对上期基线劣化 ≤ 20%」。

运行约束（关键）：
- GitHub 托管 runner 无 GPU，本测试默认跳过；
- 仅能在 self-hosted GPU runner 或本地 nightly 运行；
- 需要真实业务音频样本（tests/eval/audio/*.wav）+ faster-whisper 模型；
- 首次建立基线：ENABLE_CER_GATE=1 UPDATE_CER_BASELINE=1 运行一次；
- 日常回归：仅 ENABLE_CER_GATE=1（缺样本的样本会自动 skip，不阻塞）。

门禁逻辑：
- 逐样本比较当前 CER 与上期 baseline_cer.json：
    相对劣化 = (cer - prev) / prev，若 > CER_MAX_REL_DEGRADATION(默认0.20) 则违规；
    prev == 0 时，只要有识别错误即视为违规。
- 附加：全体样本平均 CER 不得超过 CER_MAX_MEAN（默认0.40）绝对门禁。
"""

import json
import os

import pytest

import app.main as m
from app.main import Settings

HERE = os.path.dirname(__file__)
MANIFEST_PATH = os.path.join(HERE, "samples.json")
BASELINE_PATH = os.path.join(HERE, "baseline_cer.json")
AUDIO_ROOT = os.environ.get("CER_AUDIO_ROOT", os.path.join(HERE, "audio"))

ENABLE = os.getenv("ENABLE_CER_GATE") == "1"
UPDATE = os.getenv("UPDATE_CER_BASELINE") == "1"
MAX_REL_DEGRADATION = float(os.getenv("CER_MAX_REL_DEGRADATION", "0.20"))
MAX_MEAN_CER = float(os.getenv("CER_MAX_MEAN", "0.40"))

pytestmark = [pytest.mark.gpu, pytest.mark.eval]


def _transcribe(audio_path: str) -> str:
    settings = Settings(
        WHISPER_DEVICE=os.environ.get("WHISPER_DEVICE", "cuda"),
        WHISPER_COMPUTE_TYPE=os.environ.get("WHISPER_COMPUTE_TYPE", "float16"),
        WHISPER_MODEL=os.environ.get("WHISPER_MODEL", "small"),
    )
    transcript, _ = m.transcribe(audio_path, settings)
    return transcript


@pytest.mark.skipif(not ENABLE, reason="CER 门禁默认关闭（需 GPU + 业务音频样本）")
def test_cer_no_regression():
    # tests/eval 在 pytest prepend 模式下位于 sys.path，可直接 import
    from cer_eval import load_manifest, run_evaluation

    manifest = load_manifest(MANIFEST_PATH)
    results = run_evaluation(manifest, _transcribe, AUDIO_ROOT)

    missing = [sid for sid, v in results.items() if v.get("cer") is None]
    if missing:
        pytest.skip(f"部分样本缺音频或转写失败，跳过门禁: {missing}")

    # 载入上期基线
    baseline: dict = {}
    if os.path.exists(BASELINE_PATH):
        with open(BASELINE_PATH, "r", encoding="utf-8") as fh:
            baseline = json.load(fh)

    violations = []
    for sid, v in results.items():
        cer = v["cer"]
        prev = baseline.get(sid)
        if prev is None:
            continue  # 新样本，无基线可比
        if prev <= 0:
            if cer > 0:
                violations.append((sid, prev, cer))
            continue
        degradation = (cer - prev) / prev
        if degradation > MAX_REL_DEGRADATION:
            violations.append((sid, prev, cer, round(degradation, 3)))

    cers = [v["cer"] for v in results.values()]
    mean_cer = sum(cers) / len(cers)

    # 可选：将本次结果写回基线（首次建基线或模型升级后刷新）
    if UPDATE:
        with open(BASELINE_PATH, "w", encoding="utf-8") as fh:
            json.dump(
                {sid: v["cer"] for sid, v in results.items()},
                fh, ensure_ascii=False, indent=2,
            )

    assert mean_cer <= MAX_MEAN_CER, f"平均CER={mean_cer:.4f} 超过绝对门禁 {MAX_MEAN_CER}"
    assert not violations, f"相对基线劣化>{int(MAX_REL_DEGRADATION * 100)}%: {violations}"
