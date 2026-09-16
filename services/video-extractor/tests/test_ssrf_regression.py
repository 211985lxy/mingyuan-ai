"""SSRF 回归测试（P0，对应 F18 旁路向量 / 跨语言 whitelist parity）。

验证"共享校验源"（app.main._assert_public_network / assert_supported_share_url）
能挡住以下绕过向量（与 web/TS 侧 F18 修复需保持同源一致）：
- 八进制/十进制/十六进制 IP 字面量（016.016.016.016 / 0x7f000001 / 2130706433）
  一旦被解析到回环/元数据/私网 IP，必须被 is_global 校验拒绝；
- 伪冒名子域（v.douyin.com.<攻击者>）不能绕过平台白名单后缀校验；
- 云元数据 / 链路本地 IP（169.254.169.254）必须拒绝；
- 多 A 记录中只要有一条非公网即整体拒绝（防 DNS 重绑定）。

这些测试不发起真实 DNS（monkeypatch socket.getaddrinfo 模拟解析结果），
属于纯单元回归，零重依赖，可纳入常规单测套件。
"""

import socket

import pytest

from app.main import _assert_public_network, assert_supported_share_url


def _patch_dns(monkeypatch, ips):
    """模拟解析器把任意主机名解析到 ips（可多值，模拟多 A 记录 / DNS 重绑定）。"""
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 0, "", (ip, port or 443)) for ip in ips]
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


# --------------------------------------------------------------------------
# IP 字面量旁路：解析到回环/元数据/私网即拒
# --------------------------------------------------------------------------

@pytest.mark.parametrize("literal", [
    "0x7f000001",    # 十六进制 -> 127.0.0.1
    "2130706433",    # 十进制   -> 127.0.0.1
    "0177.0.0.1",    # 八进制风格 -> 127.0.0.1
    "127.0.0.1",
])
def test_rejects_ip_literal_resolving_to_loopback(monkeypatch, literal):
    _patch_dns(monkeypatch, ["127.0.0.1"])
    with pytest.raises(ValueError, match="公网"):
        _assert_public_network(f"https://{literal}/x", True)


def test_rejects_metadata_ip(monkeypatch):
    _patch_dns(monkeypatch, ["169.254.169.254"])
    with pytest.raises(ValueError, match="公网"):
        _assert_public_network("https://169.254.169.254/latest/meta-data", True)


def test_rejects_private_ip(monkeypatch):
    _patch_dns(monkeypatch, ["10.0.0.5"])
    with pytest.raises(ValueError, match="公网"):
        _assert_public_network("https://10.0.0.5/x", True)


def test_rejects_link_local_ip(monkeypatch):
    _patch_dns(monkeypatch, ["169.254.0.1"])
    with pytest.raises(ValueError, match="公网"):
        _assert_public_network("https://169.254.0.1/x", True)


def test_rejects_multirecord_with_one_private(monkeypatch):
    # DNS 重绑定 / 多 A：只要一条非公网即整体拒绝
    _patch_dns(monkeypatch, ["1.2.3.4", "192.168.1.1"])
    with pytest.raises(ValueError, match="公网"):
        _assert_public_network("https://example.com/x", True)


def test_allows_global_ip(monkeypatch):
    _patch_dns(monkeypatch, ["8.8.8.8"])
    assert _assert_public_network("https://8.8.8.8/x", True) is not None


# --------------------------------------------------------------------------
# 伪冒名子域不能绕过平台白名单（跨语言 parity）
# --------------------------------------------------------------------------

@pytest.mark.parametrize("host", [
    "v.douyin.com.evil.com",
    "www.douyin.com.evil.com",
    "douyin.com.attacker.net",
    "bilibili.com.phishing.test",
])
def test_rejects_spoofed_platform_subdomain(monkeypatch, host):
    # 即便解析到公网 IP，也必须被白名单后缀校验拒（不能靠"含 douyin.com 子串"放行）
    _patch_dns(monkeypatch, ["1.2.3.4"])
    with pytest.raises(ValueError, match="暂不支持"):
        assert_supported_share_url(f"https://{host}/x")
