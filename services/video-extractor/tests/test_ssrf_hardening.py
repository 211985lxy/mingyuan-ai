"""F1/F2 加固回归：重定向跟随与 DNS 重绑定 TOCTOU。

- **F1 重定向**：`_stream_media` 关掉自动重定向，自己走跳转循环，每一跳重新做公网校验。
  以前 `follow_redirects=True`，一个 302 就能把请求带到云元数据地址。
- **F2 重绑定**：`_public_only_resolution` 在「即将连接的那一刻」校验 DNS 结果，
  解析出来的地址就是随后真正连接的地址，校验与连接之间没有可换 IP 的窗口。
  该守卫对 httpx（anyio → 事件循环 getaddrinfo）、yt-dlp（http.client）、f2 同样生效。

全部纯单元、零网络：httpx 用 MockTransport 打桩，DNS 用假 getaddrinfo（未登记的域名回落到真实解析）。
"""

import asyncio
import socket

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
