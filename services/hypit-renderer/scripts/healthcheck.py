"""容器健康检查。

用脚本而不是 `curl -H "X-API-Token: $TOKEN"`：命令行参数会出现在同主机的进程
列表里，而健康检查每 30 秒跑一次，没必要把 token 反复写进 `ps` 的输出。

判定依据是 `/api/v1/health` 自己的 `ok` 字段——它已经把
「doctor 通过」和「Runtime Worker 在线」合并成了一个布尔值，
这里再自己拆开判断只会制造第二套语义。
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

PORT = os.environ.get("HYPIT_PORT", "8787")
TOKEN = os.environ.get("HYPIT_API_TOKEN", "")
HEADER = os.environ.get("HYPIT_API_TOKEN_HEADER", "X-API-Token")


def main() -> int:
    request = urllib.request.Request(
        f"http://127.0.0.1:{PORT}/api/v1/health",
        headers={HEADER: TOKEN},
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            body = json.loads(response.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print(f"healthcheck failed: {exc}", file=sys.stderr)
        return 1

    if not body.get("ok"):
        warnings = body.get("warnings") or []
        print(f"healthcheck not ok: {json.dumps(warnings, ensure_ascii=False)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
