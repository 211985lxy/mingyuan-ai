"""F1/F2 加固回归：重定向跟随与 DNS 重绑定 TOCTOU。

- **F1 重定向**：`_stream_media` 关掉自动重定向，自己走跳转循环，每一跳重新做公网校验。
  以前 `follow_redirects=True`，一个 302 就能把请求带到云元数据地址。
- **F2 重绑定**：`_public_only_resolution` 在「即将连接的那一刻」校验 DNS 结果，
  解析出来的地址就是随后真正连接的地址，校验与连接之间没有可换 IP 的窗口。
  该守卫对 httpx（anyio → 事件循环 getaddrinfo）、yt-dlp（http.client）、f2 同样生效。

全部纯单元、零网络：httpx 用 MockTransport 打桩，DNS 用假 getaddrinfo（未登记的域名回落到真实解析）。
"""

import asyncio
import http.server
import ipaddress
import socket
import socketserver
import threading

import httpx
import pytest

import app.main as m
from app.main import (
    MAX_REDIRECTS,
    _public_only_resolution,
    _stream_media,
)

PUBLIC_IP = "93.184.216.34"
PRIVATE_IP = "10.0.0.5"
METADATA_IP = "169.254.169.254"

_REAL_GETADDRINFO = socket.getaddrinfo


@pytest.fixture(autouse=True)
def _reset_resolution_guard():
    """守卫是进程级补丁，用例失败也不能把它留给下一个用例。"""
    yield
    m._RESOLUTION_GUARD_DEPTH = 0
    socket.getaddrinfo = _REAL_GETADDRINFO


def _fake_dns(mapping):
    """mapping: host -> 地址或地址列表；未登记的域名回落到真实解析（字面量 IP 无需联网）。"""
    def fake(host, port, *args, **kwargs):
        if host not in mapping:
            return _REAL_GETADDRINFO(host, port, *args, **kwargs)
        addresses = mapping[host]
        if isinstance(addresses, str):
            addresses = [addresses]
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port or 443))
            for address in addresses
        ]
    return fake


def _install_mock_transport(monkeypatch, handler):
    """把 httpx.AsyncClient 换成注入了 MockTransport 的版本（生产代码不为此开测试口子）。"""
    original = httpx.AsyncClient

    def factory(**kwargs):
        kwargs.pop("transport", None)
        return original(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", factory)


# --------------------------------------------------------------------------- #
# F1：重定向
# --------------------------------------------------------------------------- #

def test_stream_media_writes_body_to_target(monkeypatch, tmp_path):
    _install_mock_transport(monkeypatch, lambda request: httpx.Response(200, content=b"0123456789"))
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"cdn.example.com": PUBLIC_IP}))
    target = tmp_path / "media.bin"

    size = asyncio.run(_stream_media("https://cdn.example.com/a.mp4", target, 1024))

    assert size == 10
    assert target.read_bytes() == b"0123456789"


def test_stream_media_follows_public_redirect(monkeypatch, tmp_path):
    seen = []

    def handler(request):
        seen.append(str(request.url))
        if request.url.path == "/start":
            return httpx.Response(302, headers={"location": "/final"})
        return httpx.Response(200, content=b"abc")

    _install_mock_transport(monkeypatch, handler)
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"cdn.example.com": PUBLIC_IP}))
    target = tmp_path / "media.bin"

    size = asyncio.run(_stream_media("https://cdn.example.com/start", target, 1024))

    assert size == 3
    # 相对跳转按原始 URL 解析，请求形态保持原样（不改写成 IP，避免与 SNI/代理打架）。
    assert seen == ["https://cdn.example.com/start", "https://cdn.example.com/final"]


def test_stream_media_refuses_redirect_to_metadata_ip(monkeypatch, tmp_path):
    """F1 核心用例：302 跳云元数据必须被拒，且绝不能真的发出那个请求。"""
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/meta-data/"})

    _install_mock_transport(monkeypatch, handler)
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"cdn.example.com": PUBLIC_IP}))
    target = tmp_path / "media.bin"

    with pytest.raises(ValueError, match="公网"):
        asyncio.run(_stream_media("https://cdn.example.com/a", target, 1024))

    assert seen == ["https://cdn.example.com/a"]  # 元数据地址从未被连接
    assert not target.exists()


def test_stream_media_refuses_redirect_to_host_resolving_private(monkeypatch, tmp_path):
    mapping = {"cdn.example.com": PUBLIC_IP, "internal.example.com": PRIVATE_IP}
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://internal.example.com/secret"})

    _install_mock_transport(monkeypatch, handler)
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns(mapping))
    target = tmp_path / "media.bin"

    with pytest.raises(ValueError, match="公网"):
        asyncio.run(_stream_media("https://cdn.example.com/a", target, 1024))

    assert len(seen) == 1


def test_stream_media_rejects_redirect_carrying_credentials(monkeypatch, tmp_path):
    """`http://user:pass@内部地址/` 这类把凭证塞进 URL 的跳转同样要挡。"""
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": "https://user:pass@cdn.example.com/a"})

    _install_mock_transport(monkeypatch, handler)
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"cdn.example.com": PUBLIC_IP}))

    with pytest.raises(ValueError, match="HTTP/HTTPS|公网"):
        asyncio.run(_stream_media("https://cdn.example.com/a", tmp_path / "media.bin", 1024))

    assert len(seen) == 1


def test_stream_media_rejects_redirect_without_location(monkeypatch, tmp_path):
    _install_mock_transport(monkeypatch, lambda request: httpx.Response(302))
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"cdn.example.com": PUBLIC_IP}))

    with pytest.raises(ValueError, match="缺少目标地址"):
        asyncio.run(_stream_media("https://cdn.example.com/a", tmp_path / "media.bin", 1024))


def test_stream_media_rejects_redirect_loop(monkeypatch, tmp_path):
    _install_mock_transport(monkeypatch, lambda request: httpx.Response(302, headers={"location": "/loop"}))
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"cdn.example.com": PUBLIC_IP}))

    with pytest.raises(ValueError, match="跳转次数"):
        asyncio.run(_stream_media("https://cdn.example.com/loop", tmp_path / "media.bin", 1024))


def test_stream_media_enforces_max_bytes(monkeypatch, tmp_path):
    _install_mock_transport(monkeypatch, lambda request: httpx.Response(200, content=b"x" * 4096))
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"cdn.example.com": PUBLIC_IP}))
    target = tmp_path / "media.bin"

    with pytest.raises(ValueError, match="200MB"):
        asyncio.run(_stream_media("https://cdn.example.com/a", target, 1024))

    assert target.stat().st_size <= 1024  # 边下边校验，超限即中断


def test_stream_media_holds_resolution_guard_while_transferring(monkeypatch, tmp_path):
    """F2 的落地证据：传输过程中 socket.getaddrinfo 处于守卫状态。"""
    fake = _fake_dns({"cdn.example.com": PUBLIC_IP})
    monkeypatch.setattr(m.socket, "getaddrinfo", fake)
    observed = {}

    def handler(request):
        observed["guarded"] = socket.getaddrinfo is not fake
        return httpx.Response(200, content=b"abc")

    _install_mock_transport(monkeypatch, handler)

    asyncio.run(_stream_media("https://cdn.example.com/a", tmp_path / "media.bin", 1024))

    assert observed["guarded"] is True


def test_max_redirects_is_bounded():
    assert MAX_REDIRECTS > 0


# --------------------------------------------------------------------------- #
# F2：进程级解析守卫
# --------------------------------------------------------------------------- #

def test_resolution_guard_blocks_private_and_restores(monkeypatch):
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"evil.example.com": METADATA_IP}))
    before = socket.getaddrinfo

    with pytest.raises(socket.gaierror, match="非公网"):
        with _public_only_resolution():
            socket.getaddrinfo("evil.example.com", 443)

    assert socket.getaddrinfo is before  # 退出作用域必须恢复原解析器
    assert m._RESOLUTION_GUARD_DEPTH == 0


def test_resolution_guard_allows_public_and_is_reentrant(monkeypatch):
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"cdn.example.com": PUBLIC_IP}))

    with _public_only_resolution():
        guarded = socket.getaddrinfo
        with _public_only_resolution():
            assert socket.getaddrinfo("cdn.example.com", 443)[0][4][0] == PUBLIC_IP
        # 内层退出不能摘掉守卫——并发任务嵌套时这是正确性前提。
        assert socket.getaddrinfo is guarded
        assert m._RESOLUTION_GUARD_DEPTH == 1

    assert m._RESOLUTION_GUARD_DEPTH == 0


def test_resolution_guard_blocks_mixed_records(monkeypatch):
    """多 A 记录混一条内网 —— DNS 重绑定的经典形态，必须整体拒绝。"""
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"cdn.example.com": [PUBLIC_IP, PRIVATE_IP]}))

    with _public_only_resolution():
        with pytest.raises(socket.gaierror, match="非公网"):
            socket.getaddrinfo("cdn.example.com", 443)


def test_resolution_guard_blocks_private_ip_literal():
    with _public_only_resolution():
        with pytest.raises(socket.gaierror, match="非公网"):
            socket.getaddrinfo(METADATA_IP, 80)


# --------------------------------------------------------------------------- #
# 回归：既有校验源语义不变
# --------------------------------------------------------------------------- #

def test_assert_public_network_still_accepts_public_share_url(monkeypatch):
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"v.douyin.com": PUBLIC_IP}))

    assert m._assert_public_network("https://v.douyin.com/abc/", reject_media=True) == "https://v.douyin.com/abc/"


def test_assert_public_network_still_rejects_private_resolution(monkeypatch):
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"v.douyin.com": PRIVATE_IP}))

    with pytest.raises(ValueError, match="公网"):
        m._assert_public_network("https://v.douyin.com/abc/", reject_media=True)


def test_assert_public_network_still_rejects_media_direct_link(monkeypatch):
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"v.douyin.com": PUBLIC_IP}))

    with pytest.raises(ValueError, match="媒体文件直链"):
        m._assert_public_network("https://v.douyin.com/abc.mp4", reject_media=True)


# --------------------------------------------------------------------------- #
# 外审复核补测（security-officer 第二轮）
#
# 起因：`test_stream_media_holds_resolution_guard_while_transferring` 用 MockTransport，
# 而 MockTransport **不做 DNS**，它只能证明"补丁装在 socket.getaddrinfo 上"，
# 证明不了"httpx 的真实解析路径会走到守卫"。下面用真实解析路径把这条补齐，
# 并把外审指出的其余四类覆盖缺口（数字型 IP、跨线程交错、协议相对/非 http 跳转、
# 代理接管目标解析）一并补上。
# --------------------------------------------------------------------------- #

def _clear_proxy_env(monkeypatch):
    """测试内清掉代理环境变量，让 httpx 直连，保证跨环境（本机有透明代理 / CI 无代理）确定。"""
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        monkeypatch.delenv(name, raising=False)


def _real_httpx_get(url, trust_env=False):
    async def run():
        async with httpx.AsyncClient(trust_env=trust_env, timeout=5) as client:
            return await client.get(url)
    return asyncio.run(run())


def _serve_local_http(hits):
    """起一个真实的本地 HTTP 服务，返回 (server, port, 关闭函数)；收到的请求路径记进 hits。"""
    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.0"

        def do_GET(self):  # noqa: N802
            hits.append(self.path)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"leaked")

        def log_message(self, *args):
            pass

    server = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever)
    thread.start()

    def shutdown():
        server.shutdown()
        server.server_close()
        thread.join(5)

    return server, server.server_address[1], shutdown


def test_resolution_guard_covers_real_httpx_resolution_path(monkeypatch):
    """守卫必须挡住**真实** httpx 请求指向内网主机的解析——不是只把补丁装上。

    链路：httpx → anyio → 事件循环 getaddrinfo → `socket.getaddrinfo`（运行期查属性，
    因此进程级补丁生效）。目标用域名 `localhost`（走解析，解析到 127.0.0.1），
    不用 MockTransport，也不依赖外网。
    判据有两重：异常文案必须来自 `_guarded_getaddrinfo`，且本地服务一个请求都不能收到。
    """
    _clear_proxy_env(monkeypatch)
    hits = []
    _server, port, shutdown = _serve_local_http(hits)
    try:
        with pytest.raises(Exception) as excinfo:
            with _public_only_resolution():
                _real_httpx_get(f"http://localhost:{port}/secret")
    finally:
        shutdown()

    assert "非公网" in str(excinfo.value)  # 文案来自守卫，说明解析那一刻被拦
    assert hits == []  # 本地服务从未收到请求


# --- 数字型 / 畸形 IP：交给真实 getaddrinfo，不 mock 解析器 ------------------- #

@pytest.mark.parametrize("host", ["2130706433", "0x7f000001", "127.1"])
def test_rejects_numeric_ip_normalized_to_loopback_by_real_resolver(host):
    """十进制 / 十六进制 / 短式点分：真实解析器会归一化到 127.0.0.1，必须拒。"""
    with pytest.raises(ValueError, match="公网"):
        m._assert_public_network(f"http://{host}/x", reject_media=False)


@pytest.mark.parametrize("url", [
    "http://[::ffff:169.254.169.254]/x",  # IPv4-mapped 元数据
    "http://[fd00:ec2::254]/x",           # ULA
    "http://[::1]/x",                     # 回环
])
def test_rejects_ipv6_literal_in_private_space(url):
    with pytest.raises(ValueError, match="公网"):
        m._assert_public_network(url, reject_media=False)


def test_octal_style_literal_never_lands_in_private_space():
    """`0177.0.0.1` 有平台差异：macOS 归一化成 177.0.0.1（公网），Linux 归一化成 127.0.0.1（回环）。

    不锁定"必须拒绝"（那会写死平台行为），只锁定安全不变量：
    要么被拒，要么放行时必须确实解析到公网——绝不能"解析到私网却被放行"。
    """
    url = "http://0177.0.0.1/x"
    try:
        m._assert_public_network(url, reject_media=False)
    except ValueError:
        return
    addresses = {item[4][0] for item in _REAL_GETADDRINFO("0177.0.0.1", 80, type=socket.SOCK_STREAM)}
    assert addresses
    assert all(ipaddress.ip_address(address).is_global for address in addresses)


# --- 跨线程交错：全局深度计数的正确性 ---------------------------------------- #

def test_resolution_guard_not_dropped_when_another_thread_is_inside(monkeypatch):
    """B 线程退出不能摘掉 A 线程仍在使用的守卫。

    `process_job` 跑在线程池里，多个下载任务会并发进入守卫。深度计数是进程级全局的，
    只要"进入"先于其他线程的"退出"，守卫就不会被提前还原——这条是 F2 在并发下成立的前提。
    """
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"cdn.example.com": PUBLIC_IP}))
    entered_b = threading.Event()
    exited_b = threading.Event()
    observed = {}

    def run_a():
        with _public_only_resolution():
            assert entered_b.wait(5)
            assert exited_b.wait(5)
            observed["a_guarded"] = socket.getaddrinfo is m._guarded_getaddrinfo

    def run_b():
        with _public_only_resolution():
            entered_b.set()
        exited_b.set()  # B 退出后 depth 从 2 降到 1，A 仍在作用域内

    thread_a = threading.Thread(target=run_a)
    thread_b = threading.Thread(target=run_b)
    thread_a.start()
    thread_b.start()
    thread_a.join(10)
    thread_b.join(10)

    assert observed.get("a_guarded") is True  # A 检查时守卫必须在位
    assert m._RESOLUTION_GUARD_DEPTH == 0
    assert socket.getaddrinfo is not m._guarded_getaddrinfo  # 全部退出后必须还原


# --- 跳转目标形态：协议相对 / 非 http(s) scheme ------------------------------- #

def test_stream_media_rejects_protocol_relative_redirect_to_private(monkeypatch, tmp_path):
    """`//internal.example.com/x` 协议相对跳转必须按当前 scheme 补全后重新校验。"""
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": "//internal.example.com/secret"})

    _install_mock_transport(monkeypatch, handler)
    monkeypatch.setattr(
        m.socket, "getaddrinfo",
        _fake_dns({"cdn.example.com": PUBLIC_IP, "internal.example.com": PRIVATE_IP}),
    )

    with pytest.raises(ValueError, match="公网"):
        asyncio.run(_stream_media("https://cdn.example.com/a", tmp_path / "media.bin", 1024))

    assert len(seen) == 1  # 内网目标从未被请求


@pytest.mark.parametrize("location", ["file:///etc/passwd", "ftp://cdn.example.com/x", "gopher://x/"])
def test_stream_media_rejects_non_http_redirect_scheme(monkeypatch, tmp_path, location):
    """跳转目标必须是 http/https——`file://`、`ftp://` 等一律拒。"""
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": location})

    _install_mock_transport(monkeypatch, handler)
    monkeypatch.setattr(m.socket, "getaddrinfo", _fake_dns({"cdn.example.com": PUBLIC_IP}))

    with pytest.raises(ValueError, match="HTTP/HTTPS|公网"):
        asyncio.run(_stream_media("https://cdn.example.com/a", tmp_path / "media.bin", 1024))

    assert len(seen) == 1


# --- 已知盲区（外审确认）：走代理时目标解析不在本进程 ------------------------- #

def test_proxy_takes_over_target_resolution_known_blind_spot(monkeypatch):
    """**这是盲区记录，不是"安全通过"**：走 HTTP 代理时目标由代理解析，守卫看不到。

    外审实测：设 `HTTP_PROXY` 后，httpx 只连代理；代理若是 IP 字面量，anyio 会走快路径
    直接跳过 DNS，因此守卫**什么都没校验到**。结论：F2 的解析守卫在代理环境下失效，
    只能靠网络层出网阻断（阻断 169.254/10/172.16/192.168 + IMDSv2）兜底。

    本用例把这一事实钉成可执行证据，防止后续误以为守卫万能；
    真实运行时 `_stream_media` 对每一跳仍做 `_assert_public_network` 预检查，F1 不依赖守卫。
    """
    resolved = []
    _original = socket.getaddrinfo

    def spy(host, port, *args, **kwargs):
        resolved.append(str(host))
        return _original(host, port, *args, **kwargs)

    received = []

    class ProxyStub(socketserver.BaseRequestHandler):
        def handle(self):
            received.append(self.request.recv(4096))
            self.request.close()

    proxy = socketserver.TCPServer(("127.0.0.1", 0), ProxyStub)
    port = proxy.server_address[1]
    thread = threading.Thread(target=proxy.serve_forever)
    thread.start()
    try:
        monkeypatch.setenv("HTTP_PROXY", f"http://127.0.0.1:{port}")
        monkeypatch.setenv("http_proxy", f"http://127.0.0.1:{port}")
        monkeypatch.setattr(socket, "getaddrinfo", spy)
        with _public_only_resolution():
            try:
                _real_httpx_get("http://example.com/", trust_env=True)
            except Exception:
                pass
    finally:
        proxy.shutdown()
        proxy.server_close()
        thread.join(5)

    assert received, "请求应当到达本地代理桩"
    assert "example.com" not in resolved, "本进程不应解析目标域名——解析发生在代理侧（盲区）"
