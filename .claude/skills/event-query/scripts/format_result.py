#!/usr/bin/env python3
"""将查询 API 返回的 JSON 格式化为 Markdown 表格。

用法:
  echo '<json>' | python3 format_result.py
  python3 format_result.py result.json
"""

import json
import sys


def format_table(data: list[dict]) -> str:
    if not data:
        return "（无数据）"

    headers = list(data[0].keys())
    col_widths = {h: max(len(str(h)), max(len(str(row.get(h, ""))) for row in data)) for h in headers}

    header_line = "| " + " | ".join(str(h).ljust(col_widths[h]) for h in headers) + " |"
    separator = "|-" + "-|-".join("-" * col_widths[h] for h in headers) + "-|"
    rows = []
    for row in data:
        cells = []
        for h in headers:
            val = row.get(h, "")
            cells.append(str(val).ljust(col_widths[h]))
        rows.append("| " + " | ".join(cells) + " |")

    return "\n".join([header_line, separator] + rows)


def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1]) as f:
            raw = f.read()
    else:
        raw = sys.stdin.read()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        print(f"ERROR: 无法解析返回结果\n{raw[:500]}", file=sys.stderr)
        sys.exit(1)

    # API 可能返回 { data: [...] } 或直接返回数组
    if isinstance(result, dict):
        if "error" in result or "message" in result:
            print(f"查询错误: {result.get('error', result.get('message', result))}", file=sys.stderr)
            sys.exit(1)
        data = result.get("data", result.get("rows", result.get("result", [])))
    elif isinstance(result, list):
        data = result
    else:
        print(f"未知返回格式: {raw[:500]}", file=sys.stderr)
        sys.exit(1)

    if not data:
        print("（查询无结果）")
        return

    total = len(data)
    if total > 50:
        print(f"共 {total} 行，显示前 50 行：\n")
        print(format_table(data[:50]))
        print(f"\n... 省略 {total - 50} 行")
    else:
        print(f"共 {total} 行：\n")
        print(format_table(data))


if __name__ == "__main__":
    main()
