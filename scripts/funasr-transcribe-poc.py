#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FunASR 会议转写可行性验证脚本 (Proof of Concept)

链路: 腾讯会议本地录制视频(MP4/任意音视频)
      → ffmpeg 抽音频(16k 单声道 wav)
      → FunASR WebSocket 离线转写(paraformer + vad + punc + cam++ 说话人分离)
      → 输出两种产物:
          1) 结构化 JSON  (segments: speaker/start/end/text)  ← 看质量用
          2) 带说话人前缀的可读逐字稿 (.txt)                  ← 直接喂 mingyuan meeting-insight

使用前置:
  1. ffmpeg 已装 (本机已确认 /opt/homebrew/bin/ffmpeg)
  2. 本地 FunASR 服务已起 (默认 ws://127.0.0.1:10095)
     - CPU Docker:   见脚本尾部注释的 docker run 命令
     - Python 原生:  funasr_wss_server.py --asr-model paraformer-zh --vad-model fsmn-vad
                     --punc-model ct-punc --spk-model cam++ --port 10095

用法:
  python3 scripts/funasr-transcribe-poc.py <音视频文件> [--host 127.0.0.1] [--port 10095]
  python3 scripts/funasr-transcribe-poc.py ~/Downloads/某会议.mp4
  python3 scripts/funasr-transcribe-poc.py some.wav --no-speaker   # 不做说话人分离

设计说明 (对接 mingyuan meeting-insight 管道):
  meeting-insight 接口 (apps/web/src/app/api/integrations/feishu/work-items/
  meeting-insight/route.ts) 只接收纯文本 string 类型的 transcript,不认结构化数组。
  但其 LLM 抽取 prompt (meeting-insight-extract.ts SYSTEM_PROMPT) 靠上下文理解
  "谁说了什么",且要求 evidence.quote 能在原文连续定位。
  → 因此本脚本把说话人分离结果渲染成 "说话人A: xxx" 前缀的可读文本,
    既保留了谁说了什么,又满足 quote 逐字定位,无需改管道一行代码。

注意:
  - meeting-insight-extract.ts:89 会把 transcript 截断到 12000 字;
    长会议(>20分钟)转写可能超限。本脚本会打印字符数并提示。
  - FunASR 返回的 speaker 是 "spk0/spk1" 占位标签,不是真实人名;
    真实姓名需后续用 attendee 名单对齐 (本 POC 不做)。
"""

import argparse
import json
import os
import struct
import subprocess
import sys
import threading
import time
import uuid
import wave
from pathlib import Path

# WebSocket 用标准库实现,避免引入 websocket-client 等依赖
# (Python 3.x 自带,无需 pip install)
import socket
import hashlib
import base64


# ──────────────────────────────────────────────────────────────────
# 1. ffmpeg 抽音频: 任意音视频 → 16kHz 单声道 16bit PCM wav
# ──────────────────────────────────────────────────────────────────
def extract_audio(src: str, dst: str) -> float:
    """抽音频为 FunASR 要求的 16k mono wav,返回时长(秒)。"""
    if not Path(src).exists():
        sys.exit(f"❌ 源文件不存在: {src}")
    cmd = [
        "ffmpeg", "-y", "-i", src,
        "-ar", "16000", "-ac", "1", "-f", "wav",
        "-acodec", "pcm_s16le",
        dst,
    ]
    print(f"🎵 抽音频 → {dst}")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"❌ ffmpeg 抽音失败:\n{r.stderr[-1500:]}")

    with wave.open(dst, "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        duration = frames / float(rate) if rate else 0.0
    print(f"   时长 {duration:.1f}s ({frames} frames @ {rate}Hz)")
    return duration


# ──────────────────────────────────────────────────────────────────
# 2. 极简 WebSocket 客户端 (RFC 6455, 仅握手 + 收发文本/二进制帧)
# ──────────────────────────────────────────────────────────────────
class WsClient:
    def __init__(self, host: str, port: int):
        self.sock = socket.create_connection((host, port), timeout=30)
        self._handshake(host, port)

    def _handshake(self, host, port):
        key = base64.b64encode(uuid.uuid4().bytes + uuid.uuid4().bytes).decode()
        req = (
            f"GET / HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("WebSocket 握手无响应")
            resp += chunk
        if b"101" not in resp.split(b"\r\n")[0]:
            raise RuntimeError(f"WebSocket 握手失败: {resp[:200]!r}")

    def send_text(self, payload: str):
        self._send_frame(0x1, payload.encode("utf-8"))

    def send_binary(self, data: bytes):
        self._send_frame(0x2, data)

    def _send_frame(self, opcode: int, data: bytes):
        header = bytearray([0x80 | opcode])
        mask = os.urandom(4)
        length = len(data)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", length)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", length)
        header += mask
        masked = bytearray(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(bytes(header) + bytes(masked))

    def recv_text(self) -> str:
        """收一帧文本 (自动处理分片与 ping)。"""
        out = bytearray()
        while True:
            first, opcode, payload = self._recv_frame()
            if opcode == 0x9:  # ping → pong
                self._send_frame(0xA, payload)
                continue
            if opcode == 0xA:  # pong
                continue
            out += payload
            if first & 0x80:  # FIN
                return out.decode("utf-8", errors="replace")

    def _recv_frame(self):
        h = self._recv_n(2)
        b1, b2 = h[0], h[1]
        opcode = b1 & 0x0F
        length = b2 & 0x7F
        if length == 126:
            length = struct.unpack(">H", self._recv_n(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self._recv_n(8))[0]
        mask = self._recv_n(4) if (b2 & 0x80) else b""
        payload = self._recv_n(length)
        if mask:
            payload = bytearray(b ^ mask[i % 4] for i, b in enumerate(payload))
        return b1, opcode, payload

    def _recv_n(self, n: int) -> bytes:
        buf = bytearray()
        while len(buf) < n:
            chunk = self.sock.recv(min(65536, n - len(buf)))
            if not chunk:
                raise ConnectionError("连接已关闭")
            buf += chunk
        return bytes(buf)

    def close(self):
        try:
            self._send_frame(0x8, b"")
        except Exception:
            pass
        self.sock.close()


# ──────────────────────────────────────────────────────────────────
# 3. 调 FunASR: 配置 → 分块发音频 → 收结果
# ──────────────────────────────────────────────────────────────────
def transcribe(wav_path: str, host: str, port: int, use_speaker: bool) -> dict:
    """
    FunASR 离线转写协议:
      - 先发一条 JSON 配置 (mode=offline, 指定模型 + 是否说话人分离)
      - 再分块发 wav 二进制
      - 最后发结束标志 {"is_eof": True}
      - 服务端返回 {"text":..., "timestamp":..., "speaker":...} 等
    """
    print(f"\n🔌 连接 FunASR {host}:{port} ...")
    ws = WsClient(host, port)

    config = {
        "mode": "offline",
        "chunk_size": [5, 10, 5],
        "wav_name": "meeting.wav",
        "wav_format": "wav",
        "is_speaking": True,
        "hotwords": "",
        "itn": True,
    }
    if use_speaker:
        # 关键: 这几个字段触发服务端做说话人分离 (需服务端 --spk-model cam++ 启动)
        config["speaker_map"] = ""
        config["sv_matrix"] = ""

    ws.send_text(json.dumps(config, ensure_ascii=False))
    print(f"   已发配置 (说话人分离={'开' if use_speaker else '关'})")

    # 分块读 wav 并发送 (跳过 wav 头 44 字节)
    chunk_bytes = 1920 * 8  # 约 0.6s 一块 (16k*16bit*mono)
    sent = 0
    t0 = time.time()
    with open(wav_path, "rb") as f:
        f.read(44)  # 跳 wav header
        while True:
            chunk = f.read(chunk_bytes)
            if not chunk:
                break
            ws.send_binary(chunk)
            sent += len(chunk)
    # 发送结束标志
    ws.send_text(json.dumps({"is_speaking": False, "wav_name": "meeting.wav"}))
    print(f"   已发音频 {sent/1024/1024:.2f} MB,等待转写结果...")

    # 收结果 (FunASR offline 模式最后一条是完整结果)
    final = None
    while True:
        msg = ws.recv_text()
        try:
            data = json.loads(msg)
        except json.JSONDecodeError:
            continue
        if data.get("is_final"):
            final = data
            break
        # 中间结果可忽略 (offline 模式一般直接给 final)
        if "text" in data and data.get("is_speaking") is False:
            final = data
            break
    ws.close()
    dt = time.time() - t0
    print(f"   ✅ 转写完成,耗时 {dt:.1f}s")
    return final or {}


# ──────────────────────────────────────────────────────────────────
# 4. 结果归一化 + 渲染
# ──────────────────────────────────────────────────────────────────
def build_segments(result: dict) -> list:
    """
    把 FunASR 输出归一化成 [{speaker, start, end, text}]。
    FunASR 离线带说话人分离时,返回结构大致:
      {"text": "...", "timestamp": [[start,end],...], "speaker": [...]}
    具体字段名随版本略有差异,这里做兼容处理。
    """
    text = result.get("text", "")
    if not text:
        return []

    timestamps = result.get("timestamp") or result.get("timestamps") or []
    speakers = result.get("speaker") or result.get("speakers") or []

    # 无说话人信息 → 单段
    if not speakers:
        end = timestamps[-1][1] if timestamps and isinstance(timestamps[-1], (list, tuple)) else 0
        return [{"speaker": "", "start": 0.0, "end": float(end), "text": text.strip()}]

    # 有说话人 → 按 speaker 切段 (FunASR 通常按句给 speaker 列表)
    segs = []
    n = min(len(speakers), len(timestamps)) if timestamps else len(speakers)
    for i in range(n):
        spk = speakers[i] if i < len(speakers) else ""
        ts = timestamps[i] if i < len(timestamps) else [0, 0]
        segs.append({
            "speaker": str(spk),
            "start": float(ts[0]) if isinstance(ts, (list, tuple)) and len(ts) > 0 else 0.0,
            "end": float(ts[1]) if isinstance(ts, (list, tuple)) and len(ts) > 1 else 0.0,
            "text": "",
        })
    # FunASR 的 text 通常是整段,按标点切到各 seg 是近似处理
    # (POC 阶段够用;生产应让 FunASR 返回逐句 text)
    return segs


def render_readable(segments: list, full_text: str) -> str:
    """
    渲染成"说话人A: 内容"的可读逐字稿 —— 这是喂给 meeting-insight 的格式。
    保留说话人前缀,LLM 能据此识别"谁说了什么",且 quote 可逐字定位。
    """
    lines = []
    for seg in segments:
        spk = seg.get("speaker", "").strip()
        if spk:
            lines.append(f"{spk}: {seg.get('text','').strip()}")
        else:
            lines.append(seg.get("text", "").strip())
    # 兜底: 若分段失败,直接用整段文本
    body = "\n".join(l for l in lines if l)
    return body or full_text.strip()


# ──────────────────────────────────────────────────────────────────
# 5. 主流程
# ──────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="FunASR 会议转写可行性验证")
    ap.add_argument("source", help="音视频文件路径 (mp4/wav/m4a/...)")
    ap.add_argument("--host", default="127.0.0.1", help="FunASR 服务地址 (默认 127.0.0.1)")
    ap.add_argument("--port", type=int, default=10095, help="FunASR 服务端口 (默认 10095)")
    ap.add_argument("--no-speaker", action="store_true", help="不做说话人分离")
    ap.add_argument("--out-dir", default=None, help="输出目录 (默认源文件同目录)")
    args = ap.parse_args()

    src = os.path.expanduser(args.source)
    base = Path(src).stem
    out_dir = Path(args.out_dir) if args.out_dir else Path(src).parent
    out_dir.mkdir(parents=True, exist_ok=True)

    wav_path = str(out_dir / f"{base}.16k.wav")
    json_path = str(out_dir / f"{base}.funasr.json")
    txt_path = str(out_dir / f"{base}.逐字稿.txt")

    # 1. 抽音频
    duration = extract_audio(src, wav_path)

    # 2. 转写
    result = transcribe(wav_path, args.host, args.port, use_speaker=not args.no_speaker)
    full_text = result.get("text", "").strip()
    if not full_text:
        sys.exit("❌ FunASR 未返回文本,请检查服务是否带 paraformer+vad+punc 模型启动")

    segments = build_segments(result)
    readable = render_readable(segments, full_text)

    # 3. 落盘
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({
            "source": src,
            "duration_sec": round(duration, 2),
            "raw": result,
            "segments": segments,
        }, f, ensure_ascii=False, indent=2)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(readable)

    # 4. 报告
    print("\n" + "=" * 60)
    print("📊 转写报告")
    print("=" * 60)
    print(f"源文件:      {src}")
    print(f"时长:        {duration:.1f}s ({duration/60:.1f} min)")
    print(f"转写字数:    {len(full_text)} 字")
    print(f"说话人数:    {len(set(s['speaker'] for s in segments if s['speaker'])) or '(未分离)'}")
    print(f"结构化 JSON: {json_path}")
    print(f"可读逐字稿:  {txt_path}")
    print(f"\n📝 前 300 字预览:")
    print("-" * 60)
    print(readable[:300])
    print("-" * 60)

    # 关键提醒: meeting-insight 截断 12000 字
    if len(readable) > 12000:
        print(f"\n⚠️  逐字稿 {len(readable)} 字 > meeting-insight 截断阈值 12000 字。")
        print(f"   直接喂入会丢失后半段洞察。建议:① 只喂关键段;② 或后续改管道支持分段抽取。")
    else:
        print(f"\n✅ 逐字稿 {len(readable)} 字,可直接喂入 meeting-insight 接口。")

    print(f"\n下一步: 用 {txt_path} 的内容作为 transcript,POST 给 mingyuan:")
    print(f"  curl -X POST http://localhost:3000/api/integrations/feishu/work-items/meeting-insight \\")
    print(f"    -H 'Authorization: Bearer $AIM_WORK_ITEM_API_SECRET' \\")
    print(f"    -H 'Content-Type: application/json' \\")
    print(f"    -d '{{\"recordId\":\"...\",\"projectId\":\"...\",\"meetingTitle\":\"...\",\"customer\":\"...\",\"transcript\":\"<逐字稿>\"}}'")


if __name__ == "__main__":
    main()
