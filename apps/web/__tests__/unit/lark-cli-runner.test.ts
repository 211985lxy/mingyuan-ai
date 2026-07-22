import { describe, expect, it, vi } from "vitest"
import {
  LarkCliError,
  getAllowedCommands,
  isCommandAllowed,
  isDomainAllowed,
  runLarkCliCommand,
  sanitizeCliLog,
} from "@/lib/integrations/lark-cli-runner"

describe("lark-cli-runner", () => {
  describe("白名单校验", () => {
    it("阻断非白名单域", async () => {
      const runner = vi.fn(async () => ({ stdout: "{}", stderr: "" }))
      await expect(
        runLarkCliCommand({ domain: "wiki" as never, command: "+create", args: [], runner }),
      ).rejects.toThrow("不允许执行飞书 CLI 域")
    })

    it("阻断非白名单命令", async () => {
      const runner = vi.fn(async () => ({ stdout: "{}", stderr: "" }))
      await expect(
        runLarkCliCommand({ domain: "base", command: "+table-delete", args: [], runner }),
      ).rejects.toThrow("不允许执行飞书 base 命令")
    })

    it("允许白名单内的 base 命令", async () => {
      const runner = vi.fn(async () => ({ stdout: '{"ok":true}', stderr: "" }))
      const result = await runLarkCliCommand({
        domain: "base",
        command: "+record-list",
        args: ["--base-token", "base_x"],
        runner,
      })
      expect(result).toEqual({ ok: true })
      expect(runner).toHaveBeenCalledWith("/mock/lark-cli", [
        "base", "+record-list", "--base-token", "base_x", "--format", "json",
      ])
    })

    it("允许白名单内的 docs 命令", async () => {
      const runner = vi.fn(async () => ({ stdout: '{"token":"doc_123"}', stderr: "" }))
      const result = await runLarkCliCommand({
        domain: "docs",
        command: "+create",
        args: ["--title", "测试"],
        runner,
      })
      expect(result).toEqual({ token: "doc_123" })
    })

    it("允许白名单内的 sheets 命令", async () => {
      const runner = vi.fn(async () => ({ stdout: '{"token":"sheet_123"}', stderr: "" }))
      const result = await runLarkCliCommand({
        domain: "sheets",
        command: "+create",
        args: ["--title", "矩阵"],
        runner,
      })
      expect(result).toEqual({ token: "sheet_123" })
    })

    it("允许白名单内的 drive 命令", async () => {
      const runner = vi.fn(async () => ({ stdout: '{"token":"file_123"}', stderr: "" }))
      const result = await runLarkCliCommand({
        domain: "drive",
        command: "+upload",
        args: ["--file-path", "/tmp/test.pdf"],
        runner,
      })
      expect(result).toEqual({ token: "file_123" })
    })
  })

  describe("identity 传递", () => {
    it("传递 bot identity", async () => {
      const runner = vi.fn(async () => ({ stdout: "{}", stderr: "" }))
      await runLarkCliCommand({
        domain: "base",
        command: "+record-get",
        args: ["--record-id", "rec_1"],
        identity: "bot",
        runner,
      })
      expect(runner).toHaveBeenCalledWith("/mock/lark-cli", [
        "base", "+record-get", "--record-id", "rec_1", "--as", "bot", "--format", "json",
      ])
    })
  })

  describe("错误分类", () => {
    it("超时错误分类为 TIMEOUT", async () => {
      const runner = vi.fn(async () => {
        const err = new Error("killed") as Error & { killed: boolean }
        err.killed = true
        throw err
      })
      try {
        await runLarkCliCommand({ domain: "docs", command: "+create", args: [], runner })
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(LarkCliError)
        expect((err as LarkCliError).code).toBe("TIMEOUT")
      }
    })

    it("权限错误分类为 PERMISSION_DENIED", async () => {
      const runner = vi.fn(async () => {
        throw { message: "request failed", stderr: "403 Forbidden" }
      })
      try {
        await runLarkCliCommand({ domain: "drive", command: "+upload", args: [], runner })
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(LarkCliError)
        expect((err as LarkCliError).code).toBe("PERMISSION_DENIED")
      }
    })

    it("非法 JSON 分类为 INVALID_JSON", async () => {
      const runner = vi.fn(async () => ({ stdout: "not json at all", stderr: "" }))
      try {
        await runLarkCliCommand({ domain: "base", command: "+field-list", args: [], runner })
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(LarkCliError)
        expect((err as LarkCliError).code).toBe("INVALID_JSON")
      }
    })

    it("空 stdout 返回空对象", async () => {
      const runner = vi.fn(async () => ({ stdout: "  ", stderr: "" }))
      const result = await runLarkCliCommand({
        domain: "base",
        command: "+record-upsert",
        args: [],
        runner,
      })
      expect(result).toEqual({})
    })
  })

  describe("CLI 路径", () => {
    it("缺少 CLI 路径时抛出 CLI_PATH_MISSING", async () => {
      try {
        await runLarkCliCommand({
          domain: "base",
          command: "+record-list",
          args: [],
          env: {},
        })
        expect.unreachable()
      } catch (err) {
        expect(err).toBeInstanceOf(LarkCliError)
        expect((err as LarkCliError).code).toBe("CLI_PATH_MISSING")
      }
    })

    it("使用显式 cliPath", async () => {
      const runner = vi.fn(async () => ({ stdout: "{}", stderr: "" }))
      await runLarkCliCommand({
        domain: "base",
        command: "+record-list",
        args: [],
        cliPath: "/usr/local/bin/lark-cli",
        runner,
      })
      expect(runner).toHaveBeenCalledWith("/usr/local/bin/lark-cli", expect.any(Array))
    })
  })

  describe("脱敏", () => {
    it("脱敏 Authorization header", () => {
      const input = "Authorization: Bearer t-abc123secret"
      const output = sanitizeCliLog(input)
      expect(output).toContain("[REDACTED]")
      expect(output).not.toContain("t-abc123secret")
    })

    it("脱敏 api_key", () => {
      const input = "api_key=sk-1234567890abcdef"
      const output = sanitizeCliLog(input)
      expect(output).toContain("[REDACTED]")
      expect(output).not.toContain("sk-1234567890abcdef")
    })

    it("截断过长日志", () => {
      const input = "x".repeat(2000)
      const output = sanitizeCliLog(input)
      expect(output.length).toBeLessThanOrEqual(1000)
    })
  })

  describe("辅助函数", () => {
    it("isDomainAllowed 正确判断", () => {
      expect(isDomainAllowed("base")).toBe(true)
      expect(isDomainAllowed("docs")).toBe(true)
      expect(isDomainAllowed("wiki")).toBe(false)
    })

    it("isCommandAllowed 正确判断", () => {
      expect(isCommandAllowed("base", "+record-list")).toBe(true)
      expect(isCommandAllowed("base", "+table-delete")).toBe(false)
      expect(isCommandAllowed("docs", "+create")).toBe(true)
    })

    it("getAllowedCommands 返回命令列表", () => {
      const commands = getAllowedCommands("base")
      expect(commands).toContain("+record-list")
      expect(commands).toContain("+field-list")
      expect(commands).not.toContain("+table-delete")
    })
  })
})
