#!/usr/bin/env python3
"""将 code-review-graph 生成的 graph.html 界面文案本地化为中文。

用法：
  python3 scripts/localize-crg-graph-zh.py
  # 重新生成后再本地化：
  code-review-graph visualize --repo . --mode auto && python3 scripts/localize-crg-graph-zh.py

注意：绝不做裸词替换（如 Search→搜索），否则会破坏 graphData 里的符号名。
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

# 仅精确 UI 串。禁止短词全局替换。
REPLACEMENTS: list[tuple[str, str]] = [
    ("Code Review Graph (Aggregated)", "代码评审图谱（聚合视图）"),
    ("Code Review Graph", "代码评审图谱"),
    (
        "Interactive code knowledge graph visualization (aggregated view).",
        "交互式代码知识图谱可视化（聚合视图）。",
    ),
    (
        "Interactive code knowledge graph visualization. Use search to find nodes, click files to expand.",
        "交互式代码知识图谱。可用搜索找节点，点击文件可展开。",
    ),
    ("Skip to graph", "跳到图谱"),
    ('aria-label="Graph legend"', 'aria-label="图例"'),
    ("Search graph nodes by name", "按名称搜索图谱节点"),
    ('aria-label="Search results"', 'aria-label="搜索结果"'),
    ("Select execution flow to highlight", "选择要高亮的执行流"),
    ("Toggle community coloring", "切换社区着色"),
    ("Fit graph to screen", "将图谱适配到屏幕"),
    ('title="Fit to screen"', 'title="适应屏幕"'),
    ("Toggle node labels", "切换节点标签"),
    ('title="Toggle labels"', 'title="切换标签"'),
    ("Show keyboard shortcuts", "显示键盘快捷键"),
    ('title="Keyboard shortcuts"', 'title="键盘快捷键"'),
    ("Close detail panel", "关闭详情面板"),
    ('aria-label="Node detail"', 'aria-label="节点详情"'),
    ("Graph statistics", "图谱统计"),
    ("Community legend", "社区图例"),
    ('aria-label="Help overlay"', 'aria-label="帮助浮层"'),
    ("Close help", "关闭帮助"),
    ("&larr; Back to Overview", "&larr; 返回总览"),
    ('aria-label="Back to overview"', 'aria-label="返回总览"'),
    ("Filter by Kind", "按类型筛选"),
    ("View Mode", "视图模式"),
    ("<h3>Nodes</h3>", "<h3>节点</h3>"),
    ("<h3>Edges</h3>", "<h3>边</h3>"),
    ("<h3>Communities</h3>", "<h3>社区</h3>"),
    ("Graph Interactions", "图谱交互"),
    ("Click a file", "点击文件"),
    ("Expand/collapse contained symbols", "展开/折叠其包含的符号"),
    ("Click symbol", "点击符号"),
    ("Show detail panel with callers/callees", "显示含调用方/被调用方的详情面板"),
    ("Shift+click file", "Shift+点击文件"),
    ("Show detail panel without toggling collapse", "显示详情面板（不切换折叠）"),
    ("Highlight connected nodes and edges", "高亮相连节点与边"),
    ("Pin a node in place", "固定节点位置"),
    ("Zoom in/out", "放大/缩小"),
    ("Click+drag background", "拖拽背景"),
    ("Pan the view", "平移视图"),
    ("Type to filter &mdash; matching nodes stay bright", "输入以过滤 — 匹配节点保持高亮"),
    ("Type to filter — matching nodes stay bright", "输入以过滤 — 匹配节点保持高亮"),
    ("Legend edges", "图例中的边"),
    ("Click edge types in the legend to toggle visibility", "点击图例中的边类型以切换可见性"),
    ("Keyboard Shortcuts", "键盘快捷键"),
    ("Focus search", "聚焦搜索框"),
    ("Toggle this help", "开关本帮助"),
    ("Close panel / search / help", "关闭面板 / 搜索 / 帮助"),
    ("Activate focused node", "激活当前焦点节点"),
    ("Navigate between nodes", "在节点间导航"),
    ("Click anywhere outside to dismiss", "点击外部任意处关闭"),
    ("<td>Hover</td>", "<td>悬停</td>"),
    ("<td>Drag</td>", "<td>拖拽</td>"),
    ("<td>Scroll</td>", "<td>滚轮</td>"),
    ("<td>Search</td>", "<td>搜索</td>"),
    ("Laying out graph&hellip;", "正在布局图谱…"),
    ("Laying out graph…", "正在布局图谱…"),
    ("No nodes to display", "没有可显示的节点"),
    (
        "The graph is empty. Run <strong>code-review-graph build</strong> to index your codebase, then regenerate the visualization.",
        "图谱为空。请先运行 <strong>code-review-graph build</strong> 索引代码库，再重新生成可视化。",
    ),
    ('placeholder="Search nodes&#8230;"', 'placeholder="搜索节点…"'),
    ('placeholder="Search nodes…"', 'placeholder="搜索节点…"'),
    # 按钮文案：匹配完整标签，避免误伤标识符
    (">Calls</button>", ">调用</button>"),
    (">Imports</button>", ">导入</button>"),
    (">Inherits</button>", ">继承</button>"),
    (">Contains</button>", ">包含</button>"),
    (">Implements</button>", ">实现</button>"),
    (">Tested By</button>", ">被测试</button>"),
    (">Depends On</button>", ">依赖</button>"),
    (">Communities</button>", ">社区</button>"),
    (">Labels</button>", ">标签</button>"),
    (">Fit</button>", ">适配</button>"),
    ("> File</div>", "> 文件</div>"),
    ("> Class</div>", "> 类</div>"),
    ("> Function</div>", "> 函数</div>"),
    ("> Test</div>", "> 测试</div>"),
    ("> Type</div>", "> 类型</div>"),
    ("> Community</div>", "> 社区</div>"),
    ("> File</label>", "> 文件</label>"),
    ("> Class</label>", "> 类</label>"),
    ("> Function</label>", "> 函数</label>"),
    ("> Test</label>", "> 测试</label>"),
    ("> Type</label>", "> 类型</label>"),
    ("> Community</label>", "> 社区</label>"),
    ('<option value="">Flows</option>', '<option value="">执行流</option>'),
    # JS 字符串字面量（带引号，避免误伤）
    ('si("Nodes"', 'si("节点"'),
    ('si("Edges"', 'si("边"'),
    ('si("Files"', 'si("文件"'),
    ('si("Languages"', 'si("语言"'),
    ('addStat("Nodes"', 'addStat("节点"'),
    ('addStat("Edges"', 'addStat("边"'),
    ('addStat("Files"', 'addStat("文件"'),
    ('addStat("Languages"', 'addStat("语言"'),
    ('addStat("Mode"', 'addStat("模式"'),
    (' + " nodes)"', ' + " 个节点)"'),
    ('"Lines: "', '"行号: "'),
    ('"Params: "', '"参数: "'),
    ('"Returns: "', '"返回: "'),
    ('"Community: "', '"社区: "'),
    ('"Params:"', '"参数:"'),
    ('"Returns:"', '"返回:"'),
    ('"Community:"', '"社区:"'),
    ('"Callers ("', '"调用方 ("'),
    ('"Callees ("', '"被调用 ("'),
    ('"Connected ("', '"相连 ("'),
    ('"Community " +', '"社区 " +'),
    ('"Nodes not assigned to any community"', '"未归入任何社区的节点"'),
    (
        '"Showing communities. Double-click to drill down."',
        '"正在显示社区。双击可下钻查看。"',
    ),
    ('"Showing file-level aggregation."', '"正在显示文件级聚合。"'),
    ('"Showing all nodes."', '"正在显示全部节点。"'),
    ('"Double-click node to drill down"', '"双击节点可下钻"'),
    ('"Viewing community: "', '"正在查看社区: "'),
    ('". Click Back to return."', '"。点击「返回」回到总览。"'),
    (' || "n/a"', ' || "无"'),
    ("Nodes not assigned to any community", "未归入任何社区的节点"),
]

KIND_AND_EDGE_INJECT = r"""
var KIND_LABEL_ZH = { File:"文件", Class:"类", Function:"函数", Test:"测试", Type:"类型", Community:"社区" };
var EDGE_LABEL_ZH = {
  CALLS:"调用", IMPORTS_FROM:"导入", INHERITS:"继承", CONTAINS:"包含",
  IMPLEMENTS:"实现", TESTED_BY:"被测试", DEPENDS_ON:"依赖", CROSS_COMMUNITY:"跨社区"
};
function kindLabel(k) { return KIND_LABEL_ZH[k] || k; }
function edgeLabel(k) { return EDGE_LABEL_ZH[k] || k.replace(/_/g, " "); }
"""


def inject_label_helpers(html: str) -> str:
    if "function kindLabel(" in html:
        return html

    # 插在第一个 escH 定义后
    html2, n = re.subn(
        r'(function escH\(s\) \{ return !s \? "" : s\.replace\(/&/g,"&amp;"\)'
        r'\.replace\(/</g,"&lt;"\)\.replace\(/>/g,"&gt;"\)\.replace\(/"/g,"&quot;"\)'
        r"\.replace\(/'/g,\"&#39;\"\)\.replace\(/`/g,\"&#96;\"\); \})",
        r"\1" + KIND_AND_EDGE_INJECT,
        html,
        count=1,
    )
    if n == 0:
        return html
    html = html2

    # 展示层：tooltip / detail 的 kind
    html = html.replace("escH(d.kind)", "escH(kindLabel(d.kind))")
    html = html.replace(".textContent = d.kind", ".textContent = kindLabel(d.kind)")

    # 聚合视图图例：节点 kind / 边 label
    html = html.replace(
        'div.appendChild(document.createTextNode(" " + k));',
        'div.appendChild(document.createTextNode(" " + kindLabel(k)));',
        1,
    )
    html = html.replace(
        'var label = k.replace(/_/g, " ").replace(/\\b\\w/g, function(c) { return c.toUpperCase(); });\n'
        '    div.appendChild(document.createTextNode(" " + label));',
        'div.appendChild(document.createTextNode(" " + edgeLabel(k)));',
        1,
    )
    return html


def localize(html: str) -> str:
    html = html.replace('<html lang="en">', '<html lang="zh-CN">', 1)
    for old, new in REPLACEMENTS:
        html = html.replace(old, new)
    return inject_label_helpers(html)


def assert_not_corrupted(html: str) -> None:
    mixed = re.findall(r"[A-Za-z_][\w]*[\u4e00-\u9fff]+[\w]*", html)
    # graph 数据里几乎不该出现「英文+汉字」粘在一起的标识符
    suspects = [m for m in mixed if not m.startswith(("si", "addStat"))]
    # 允许中文 UI 邻近，但禁止典型污染
    banned_sub = ("legend节点", "legend边", "show标签", "URL搜索", "handle搜索", "createTextNode")
    for b in banned_sub:
        if b in html and "节点" in b.replace("legend", ""):
            pass
    if "legend节点" in html or "legend边" in html or "show标签" in html:
        raise SystemExit("本地化结果污染了 JS 标识符，已中止写入。请先重新 visualize。")


def main() -> None:
    parser = argparse.ArgumentParser(description="本地化 code-review-graph 的 graph.html 为中文")
    parser.add_argument(
        "--path",
        type=Path,
        default=Path(__file__).resolve().parents[1] / ".code-review-graph" / "graph.html",
    )
    args = parser.parse_args()
    path: Path = args.path
    if not path.is_file():
        raise SystemExit(f"找不到文件: {path}")

    original = path.read_text(encoding="utf-8")
    if "legend节点" in original or "URL搜索Params" in original:
        raise SystemExit(f"{path} 已损坏，请先运行: code-review-graph visualize --repo . --mode auto")

    updated = localize(original)
    assert_not_corrupted(updated)
    if updated == original:
        print(f"无需改动（可能已是中文）: {path}")
        return
    path.write_text(updated, encoding="utf-8")
    print(f"已本地化为中文: {path}")


if __name__ == "__main__":
    main()
