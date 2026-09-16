"""纯函数层测试：平台白名单、SSRF 公网校验、媒体直链拦截。

这些函数无网络真实调用，通过 monkeypatch ``socket.getaddrinfo`` 注入解析结果，
覆盖内网/回环/链路本地/不可解析等 SSRF 场景，无需安装 whisper/f2/yt-dlp。
"""

import socket

import pytest

from app.main import assert_public_url, assert_supported_share_url, _assert_public_network


def _patch_dns(monkeypatch, ip):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", (ip, port or 443))]
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


# --- 平台白名单 ---

def test_supported_douyin(monkeypatch):
    _patch_dns(monkeypatch, "1.2.3.4")
    url = "https://www.douyin.com/share/video/123"
    assert assert_supported_share_url(url) == url


def test_supported_bilibili(monkeypatch):
    _patch_dns(monkeypatch, "1.2.3.4")
    assert assert_supported_share_url("https://www.bilibili.com/video/BV123") is not None


def test_supported_youtube(monkeypatch):
    _patch_dns(monkeypatch, "1.2.3.4")
    assert assert_supported_share_url("https://www.youtube.com/watch?v=abc") is not None


def test_supported_kuaishou(monkeypatch):
    _patch_dns(monkeypatch, "1.2.3.4")
    assert assert_supported_share_url("https://www.kuaishou.com/short-video/123") is not None


def test_unsupported_platform(monkeypatch):
    _patch_dns(monkeypatch, "1.2.3.4")
    with pytest.raises(ValueError, match="暂不支持"):
        assert_supported_share_url("https://www.example.com/video/123")


# --- SSRF / 公网 IP 校验 ---

def test_rejects_private_ip(monkeypatch):
    _patch_dns(monkeypatch, "192.168.1.1")
    with pytest.raises(ValueError, match="公网"):
        _assert_public_network("https://192.168.1.1/x", True)


def test_rejects_loopback(monkeypatch):
    _patch_dns(monkeypatch, "127.0.0.1")
    with pytest.raises(ValueError, match="公网"):
        _assert_public_network("https://127.0.0.1/x", True)


def test_rejects_link_local(monkeypatch):
    _patch_dns(monkeypatch, "169.254.169.254")
    with pytest.raises(ValueError, match="公网"):
        _assert_public_network("https://169.254.169.254/latest/meta-data", True)


def test_rejects_unresolvable(monkeypatch):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        raise socket.gaierror("no route")
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    with pytest.raises(ValueError, match="无法解析"):
        _assert_public_network("https://nonexistent.invalid/x", True)


def test_allows_global_ip(monkeypatch):
    _patch_dns(monkeypatch, "8.8.8.8")
    assert _assert_public_network("https://8.8.8.8/x", True) is not None


# --- 媒体直链 / 非 http / 用户凭证 ---

def test_rejects_media_direct_link(monkeypatch):
    _patch_dns(monkeypatch, "1.2.3.4")
    with pytest.raises(ValueError, match="媒体文件直链"):
        assert_public_url("https://www.douyin.com/abc.mp4")


def test_rejects_non_http_scheme(monkeypatch):
    _patch_dns(monkeypatch, "1.2.3.4")
    with pytest.raises(ValueError, match="HTTP/HTTPS"):
        assert_public_url("ftp://www.douyin.com/x")


def test_rejects_userinfo(monkeypatch):
    _patch_dns(monkeypatch, "1.2.3.4")
    with pytest.raises(ValueError, match="HTTP/HTTPS"):
        assert_public_url("https://user:pwd@www.douyin.com/x")
