#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
阿里云录音文件识别 验证脚本 (Proof of Concept)

把"腾讯会议本地录制"或任意音频 URL,经阿里云录音文件识别 (NLS FileTrans)
转成带说话人分离的可读逐字稿,验证云端 ASR 这条路。

为什么是云端而不是本地 FunASR:
  - mingyuan 已接阿里云 ASR (一句话识别,见 lib/aliyun-asr.ts),同一套 AccessKey
  - 录音文件识别是它的"长音频版",同源 Paraformer 底座,质量与 FunASR 一致
  - 按时长计费 (新用户每 24h 免费识别 2 小时),无需本地部署
  - 说话人分离: auto_split=true + ChannelId 区分发言人

对接 mingyuan 的方式 (验证后):
  本脚本输出"带说话人前缀的可读逐字稿",可直接作为 transcript 字符串喂入:
    POST /api/integrations/feishu/work-items/meeting-insight
  meeting-insight 管道只认 string (见 meeting-insight-extract.ts),
  LLM 靠 "发言人A: xxx" 前缀理解谁说了什么,无需改管道。

两种用法:
  1) 已有公网音频 URL (推荐先用这个验证):
       python3 scripts/aliyun-filetrans-poc.py --url https://xxx/meeting.wav
  2) 本地文件 + OSS 直传 (需 mingyuan 的 OSS_ 环境变量):
       python3 scripts/aliyun-filetrans-poc.py --file ~/Downloads/meeting.mp4

环境变量 (从 mingyuan/.env.local 复制,或单独 export):
  OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET / OSS_REGION  (--file 模式必填)
  ALIYUN_NLS_APP_KEY  (NLS 项目 AppKey,必填)
  鉴权 AK 复用 OSS_ACCESS_KEY_ID/SECRET (与现有 aliyun-asr.ts 同源)

注意:
  - 开启说话人分离时,官方建议音频 ≤ 2 小时
  - file_link 必须公网可访问;--file 模式会传到 OSS 并生成临时签名 URL
  - 说话人是 ChannelId 占位 (发言人0/1),真实姓名需后续对齐 attendee 名单
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

REGION = "cn-shanghai"
FILETRANS_HOST = f"filetrans.{REGION}.aliyuncs.com"
# 官方 API 版本
API_VERSION = "2018-08-21"


# ──────────────────────────────────────────────────────────────────
# 阿里云 POP RPC 签名 (与 mingyuan lib/aliyun-asr.ts getAliyunNlsToken 同算法)
# ──────────────────────────────────────────────────────────────────
def percent_encode(s: str) -> str:
    """RFC 3986 编码,与阿里云 POP 要求一致。"""
    return urllib.parse.quote(s, safe="~")


def sign_pop_request(
    access_key_id: str,
    access_key_secret: str,
    common_params: dict,
    action: str,
) -> str:
    """
    构造阿里云 POP RPC 请求 URL (含签名)。
    返回完整 GET URL。
    """
    params: dict = {
        "AccessKeyId": access_key_id,
        "Action": action,
        "Format": "JSON",
        "RegionId": REGION,
        "SignatureMethod": "HMAC-SHA1",
        "SignatureNonce": str(uuid.uuid4()),
        "SignatureVersion": "1.0",
        "Timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "Version": API_VERSION,
    }
    params.update(common_params)

    # 升序拼 canonicalized query string
    sorted_keys = sorted(params.keys())
    canonical = "&".join(
        f"{percent_encode(k)}={percent_encode(str(params[k]))}" for k in sorted_keys
    )
    string_to_sign = f"GET&{percent_encode('/')}&{percent_encode(canonical)}"

    # HMAC-SHA1, key = secret + "&"
    digest = hmac.new(
        (access_key_secret + "&").encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha1,
    ).digest()
    signature = base64.b64encode(digest).decode("utf-8")

    return f"https://{FILETRANS_HOST}/?{canonical}&Signature={percent_encode(signature)}"


def call_pop(action: str, extra_params: dict, ak_id: str, ak_secret: str) -> dict:
    """发起一次 POP RPC GET 调用,返回解析后的 JSON。"""
    url = sign_pop_request(ak_id, ak_secret, extra_params, action)
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        sys.exit(f"❌ 阿里云 POP 调用失败 ({action}, HTTP {e.code}):\n{body}")
    except Exception as e:
        sys.exit(f"❌ 阿里云 POP 调用异常 ({action}): {e}")
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        sys.exit(f"❌ 阿里云返回非 JSON ({action}):\n{body[:500]}")


# ──────────────────────────────────────────────────────────────────
# OSS 上传 (复用 mingyuan 已有的 OSS_ 配置, --file 模式用)
# 用极简 PUT (阿里云 OSS 支持 PUT 直传,需签名)。为避免引入 ali-oss 依赖,
# 这里用 OSS 的 PUT 签名方式实现。仅 POC 用。
# ──────────────────────────────────────────────────────────────────
def upload_to_oss_signed(
    local_path: str,
    bucket: str,
    region: str,
    ak_id: str,
    ak_secret: str,
) -> str:
    """
    把本地文件 PUT 到 OSS,返回该对象的公网 URL。
    key = meeting-recordings/{timestamp}-{uuid}.{ext}
    公开读 Bucket 直接返回 URL;私有 Bucket 需后续 generateSignedUrl (本 POC 假设可公读,
    生产应走 mingyuan 的 generateSignedUrl)。
    """
    ext = Path(local_path).suffix.lstrip(".") or "wav"
    key = f"meeting-recordings/{int(time.time())}-{uuid.uuid4().hex[:8]}.{ext}"
    host = f"{bucket}.{region}.aliyuncs.com"
    url = f"https://{host}/{key}"

    content_type = _guess_content_type(ext)
    data = Path(local_path).read_bytes()

    # OSS V1 签名: Authorization: OSS {AKID}:{signature}
    # string_to_sign = PUT\n\n{content-type}\n{date}\n/{bucket}/{key}
    date = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())
    string_to_sign = f"PUT\n\n{content_type}\n{date}\n/{bucket}/{key}"
    signature = base64.b64encode(
        hmac.new(
            ak_secret.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha1
        ).digest()
    ).decode("utf-8")

    req = urllib.request.Request(url, data=data, method="PUT")
    req.add_header("Content-Type", content_type)
    req.add_header("Date", date)
    req.add_header("Authorization", f"OSS {ak_id}:{signature}")
    print(f"📤 上传到 OSS: {key} ({len(data)/1024/1024:.2f} MB)")
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        sys.exit(f"❌ OSS 上传失败 (HTTP {e.code}): {body[:500]}")
    return url


def _guess_content_type(ext: str) -> str:
    return {
        "wav": "audio/wav", "mp3": "audio/mpeg", "m4a": "audio/mp4",
        "mp4": "video/mp4", "aac": "audio/aac", "ogg": "audio/ogg",
        "flac": "audio/flac",
    }.get(ext.lower(), "application/octet-stream")


# ──────────────────────────────────────────────────────────────────
# 录音文件识别: 提交 + 轮询
# ──────────────────────────────────────────────────────────────────
def submit_transcription(file_link: str, app_key: str, ak_id: str, ak_secret: str,
                         speaker_num: int | None) -> str:
    """提交录音文件识别任务,返回 TaskId。"""
    task: dict = {
        "appkey": app_key,
        "file_link": file_link,
        "version": "4.0",
        "auto_split": True,      # 说话人分离
        "enable_words": False,
    }
    if speaker_num and speaker_num >= 2:
        task["supervise_type"] = 1   # 1 = 手动指定说话人数
        task["speaker_num"] = speaker_num

    # 提交任务用 POST,Body 是 Task 参数 JSON。但 POP 提交动作 SubmitTaskViolation? 不,
    # 录音文件识别提交动作是 "UploadData"?  实际是 "PostEvaluationTask"?
    # 正确: 阿里云录音文件识别提交动作 = "PostAsrTask" (或老版 "SubmitTask")。
    # 用通用 Action=SubmitTask 并把 Task JSON 放在 Task 参数里。
    # —— 修正: 经文档,提交接口 Action = "PostAsrTask",参数 Task (JSON string)。
    extra = {"Task": json.dumps(task, ensure_ascii=False)}
    result = call_pop("PostAsrTask", extra, ak_id, ak_secret)

    task_id = result.get("TaskId") or result.get("taskId")
    if not task_id:
        sys.exit(f"❌ 提交未返回 TaskId:\n{json.dumps(result, ensure_ascii=False, indent=2)}")
    print(f"✅ 已提交,TaskId = {task_id}")
    return str(task_id)


def poll_result(task_id: str, ak_id: str, ak_secret: str, timeout_s: int = 600) -> dict:
    """轮询任务结果,直到成功或超时。"""
    extra = {"TaskId": task_id}
    start = time.time()
    poll_interval = 5
    while time.time() - start < timeout_s:
        result = call_pop("GetAsrTaskResult", extra, ak_id, ak_secret)
        status_code = result.get("StatusCode") or result.get("statusCode")
        status_text = result.get("StatusText") or result.get("statusText") or ""
        elapsed = int(time.time() - start)
        print(f"   ⏳ [{elapsed}s] status={status_code} {status_text}")

        # 21050000 = 成功; 21050000 是识别完成
        if status_code == 21050000:
            return result
        # 失败状态码 (21xxxxx 中部分)
        if status_code and status_code != 21000000:
            # 21000000 = 任务排队/处理中; 其他非该值多为失败
            if status_code not in (21000000, 21050000):
                sys.exit(f"❌ 识别失败 (status={status_code}): {status_text}\n{json.dumps(result, ensure_ascii=False, indent=2)}")
        time.sleep(poll_interval)
    sys.exit(f"❌ 轮询超时 ({timeout_s}s)")


# ──────────────────────────────────────────────────────────────────
# 结果渲染: Sentences[{Text, ChannelId, BeginTime, EndTime}] → 可读逐字稿
# ──────────────────────────────────────────────────────────────────
def render_transcript(result: dict) -> tuple[str, list[dict], dict]:
    """
    返回 (可读逐字稿文本, sentences 结构化, 统计信息)。
    ChannelId 映射成 "发言人A/B/...",LLM 据此理解谁说了什么。
    """
    asr_result = result.get("Result") or result.get("result") or {}
    sentences = asr_result.get("Sentences") or asr_result.get("sentences") or []

    if not sentences:
        sys.exit(f"❌ 结果中无 Sentences。原始返回:\n{json.dumps(result, ensure_ascii=False, indent=2)[:1000]}")

    spk_label = {}  # channel_id → 发言人X
    lines = []
    out_segments = []
    for s in sentences:
        ch = s.get("ChannelId", 0)
        if ch not in spk_label:
            spk_label[ch] = f"发言人{chr(ord('A') + len(spk_label))}"
        label = spk_label[ch]
        text = (s.get("Text") or "").strip()
        begin = s.get("BeginTime", 0)
        end = s.get("EndTime", 0)
        lines.append(f"{label}: {text}")
        out_segments.append({
            "speaker": label,
            "channel_id": ch,
            "start_ms": begin, "end_ms": end,
            "start_s": round(begin / 1000, 2), "end_s": round(end / 1000, 2),
            "text": text,
        })

    readable = "\n".join(lines)
    stats = {
        "segment_count": len(sentences),
        "speaker_count": len(spk_label),
        "speakers": list(spk_label.values()),
        "total_chars": len(readable),
        "duration_s": round((sentences[-1].get("EndTime", 0)) / 1000, 1) if sentences else 0,
    }
    return readable, out_segments, stats


# ──────────────────────────────────────────────────────────────────
# 主流程
# ──────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="阿里云录音文件识别验证 (云端 ASR + 说话人分离)")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", help="公网可访问的音频/视频 URL")
    src.add_argument("--file", help="本地音视频文件路径 (会自动传 OSS)")
    ap.add_argument("--speaker-num", type=int, default=None,
                    help="预期说话人数 (2-100);不填则算法自动判断")
    ap.add_argument("--poll-timeout", type=int, default=600, help="轮询超时秒数 (默认 600)")
    ap.add_argument("--out-dir", default=".", help="输出目录")
    args = ap.parse_args()

    # 环境变量
    app_key = os.environ.get("ALIYUN_NLS_APP_KEY", "").strip()
    ak_id = os.environ.get("OSS_ACCESS_KEY_ID", "").strip()
    ak_secret = os.environ.get("OSS_ACCESS_KEY_SECRET", "").strip()
    if not app_key:
        sys.exit("❌ 缺 ALIYUN_NLS_APP_KEY (mingyuan .env.local 里有,export 一下)")
    if not ak_id or not ak_secret:
        sys.exit("❌ 缺 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. 拿到音频 URL
    if args.url:
        file_link = args.url
        name_base = "remote-" + urllib.parse.urlparse(file_link).path.rsplit("/", 1)[-1][:30] or "audio"
        print(f"🔗 使用公网 URL: {file_link}")
    else:
        bucket = os.environ.get("OSS_BUCKET", "").strip()
        region = os.environ.get("OSS_REGION", "").strip()
        if not bucket or not region:
            sys.exit("❌ --file 模式需 OSS_BUCKET / OSS_REGION 环境变量")
        file_link = upload_to_oss_signed(args.file, bucket, region, ak_id, ak_secret)
        name_base = Path(args.file).stem

    # 2. 提交识别
    print(f"\n🚀 提交录音文件识别 (说话人分离={'开, speaker_num=' + str(args.speaker_num) if args.speaker_num else '开, 自动'})")
    task_id = submit_transcription(file_link, app_key, ak_id, ak_secret, args.speaker_num)

    # 3. 轮询
    print(f"\n⏳ 轮询结果 (最长 {args.poll_timeout}s)...")
    result = poll_result(task_id, ak_id, ak_secret, args.poll_timeout)

    # 4. 渲染
    readable, segments, stats = render_transcript(result)

    json_path = out_dir / f"{name_base}.filetrans.json"
    txt_path = out_dir / f"{name_base}.逐字稿.txt"
    json_path.write_text(
        json.dumps({"task_id": task_id, "stats": stats, "segments": segments, "raw": result},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    txt_path.write_text(readable, encoding="utf-8")

    # 5. 报告
    print("\n" + "=" * 60)
    print("📊 录音文件识别报告")
    print("=" * 60)
    print(f"TaskId:        {task_id}")
    print(f"时长:          {stats['duration_s']}s ({stats['duration_s']/60:.1f} min)")
    print(f"段数:          {stats['segment_count']}")
    print(f"说话人数:      {stats['speaker_count']} ({', '.join(stats['speakers'])})")
    print(f"总字数:        {stats['total_chars']}")
    print(f"结构化 JSON:   {json_path}")
    print(f"可读逐字稿:    {txt_path}")
    print(f"\n📝 前 400 字预览:")
    print("-" * 60)
    print(readable[:400])
    print("-" * 60)

    if stats["total_chars"] > 12000:
        print(f"\n⚠️  逐字稿 {stats['total_chars']} 字 > meeting-insight 截断阈值 12000 字。")
        print(f"   直接喂入会丢后半段洞察。后续需分段抽取或扩大截断。")
    else:
        print(f"\n✅ 字数在阈值内,可直接喂 meeting-insight。")

    print(f"\n下一步: 把 {txt_path} 内容作为 transcript,POST 给 mingyuan meeting-insight 接口。")


if __name__ == "__main__":
    main()
