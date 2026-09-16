"""CER 计算与评测脚本（中文语音识别质量评估）。

- 中文使用字符错误率 CER = 编辑距离(ref, hyp) / len(ref)
- 纯 Python 实现 Levenshtein，零额外依赖即可运行；
- 可选 jiwer.cer 作为交叉校验（设置 USE_JIWER=1 且安装 jiwer 时启用）。
- 既可作为 pytest 门禁（被 test_cer_gate 调用），也可 CLI 独立运行（需 GPU 环境）。

用法（CLI，需在装有 faster-whisper 的 GPU 环境执行）：
    python cer_eval.py --manifest samples.json --audio-root audio --out cer_results.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
from typing import Callable

try:
    import jiwer
    _HAS_JIWER = True
except Exception:  # pragma: no cover - 依赖可选
    _HAS_JIWER = False


def levenshtein(a: str, b: str) -> int:
    """标准编辑距离（DP，O(n*m)）。中文按字符粒度。"""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def character_error_rate(hypothesis: str, reference: str) -> float:
    """字符错误率；参考文本为空时退化为 0（或 1 若有识别结果）。"""
    if not reference:
        return 0.0 if not hypothesis else 1.0
    return levenshtein(reference, hypothesis) / len(reference)


def cer_jiwer(hypothesis: str, reference: str) -> float:
    if not _HAS_JIWER:
        raise RuntimeError("jiwer 未安装，请 pip install jiwer 或改用纯 Python CER")
    return jiwer.cer(reference, hypothesis)


_PUNCT = r"[，。、！？；：""''（）(){}\[\]《》\-\—,.!?;:\"\'()]"


def normalize(text: str) -> str:
    """去空白与标点，统一 CER 比较口径（可在门禁中以 --no-normalize 关闭）。"""
    text = re.sub(r"\s+", "", text)
    text = re.sub(_PUNCT, "", text)
    return text


def run_evaluation(
    manifest: dict,
    transcribe: Callable[[str], str],
    audio_root: str,
    use_jiwer: bool = False,
    normalize_text: bool = True,
) -> dict:
    """对 manifest 中每个样本调用 transcribe(audio_path) 并计算 CER。

    transcribe: (audio_path: str) -> hypothesis_text
    返回 {sample_id: {"cer": float|None, "reference": str, "hypothesis": str|None, "error": str|None}}
    """
    results: dict = {}
    for sample in manifest.get("samples", []):
        sid = sample["id"]
        audio_path = os.path.join(audio_root, sample["path"])
        reference = sample["reference"]
        if not os.path.exists(audio_path):
            results[sid] = {"cer": None, "error": "missing_audio", "reference": reference, "hypothesis": None}
            continue
        try:
            hyp = transcribe(audio_path)
        except Exception as exc:  # noqa: BLE001 - 评测需捕获并记录失败
            results[sid] = {"cer": None, "error": f"transcribe_failed: {exc}", "reference": reference, "hypothesis": None}
            continue
        ref_n, hyp_n = (normalize(reference), normalize(hyp)) if normalize_text else (reference, hyp)
        cer = cer_jiwer(hyp_n, ref_n) if (use_jiwer and _HAS_JIWER) else character_error_rate(hyp_n, ref_n)
        results[sid] = {"cer": round(cer, 4), "reference": ref_n, "hypothesis": hyp_n, "error": None}
    return results


def load_manifest(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def main():
    parser = argparse.ArgumentParser(description="CER 评测（需 GPU / whisper 环境）")
    here = os.path.dirname(__file__)
    parser.add_argument("--manifest", default=os.path.join(here, "samples.json"))
    parser.add_argument("--audio-root", default=os.environ.get("CER_AUDIO_ROOT", os.path.join(here, "audio")))
    parser.add_argument("--out", default=os.path.join(here, "cer_results.json"))
    parser.add_argument("--use-jiwer", action="store_true")
    parser.add_argument("--no-normalize", action="store_true")
    args = parser.parse_args()

    manifest = load_manifest(args.manifest)

    def default_transcribe(audio_path: str) -> str:
        import app.main as am
        from app.main import Settings
        settings = Settings(
            WHISPER_DEVICE=os.environ.get("WHISPER_DEVICE", "cuda"),
            WHISPER_COMPUTE_TYPE=os.environ.get("WHISPER_COMPUTE_TYPE", "float16"),
            WHISPER_MODEL=os.environ.get("WHISPER_MODEL", "small"),
        )
        transcript, _ = am.transcribe(audio_path, settings)
        return transcript

    results = run_evaluation(
        manifest, default_transcribe, args.audio_root,
        use_jiwer=args.use_jiwer, normalize_text=not args.no_normalize,
    )
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(results, fh, ensure_ascii=False, indent=2)

    valid = [v["cer"] for v in results.values() if v.get("cer") is not None]
    mean = sum(valid) / len(valid) if valid else float("nan")
    print(f"样本数={len(results)} 有效={len(valid)} 平均CER={mean:.4f}")
    for sid, v in results.items():
        flag = "" if v.get("cer") is not None else f"  !! {v.get('error')}"
        print(f"  {sid}: cer={v.get('cer')}{flag}")


if __name__ == "__main__":
    main()
