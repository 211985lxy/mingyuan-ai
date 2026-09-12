import { afterEach, describe, expect, it, vi } from "vitest"

import { main, parseProjectMergeArgs } from "../../scripts/merge-account-projects"

const previewResult = {
  source: { projectId: "source" },
  target: { projectId: "target" },
}

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = undefined
})

describe("project merge CLI", () => {
  it("parses source and target as a dry-run by default", () => {
    expect(parseProjectMergeArgs([
      "--source-project", "source",
      "--target-project", "target",
    ])).toMatchObject({
      apply: false,
      sourceProjectId: "source",
      targetProjectId: "target",
    })
  })

  it("requires an exact directional confirmation before apply", () => {
    expect(() => parseProjectMergeArgs([
      "--source-project", "source",
      "--target-project", "target",
      "--apply",
    ])).toThrow("--confirm source->target")

    expect(() => parseProjectMergeArgs([
      "--source-project", "source",
      "--target-project", "target",
      "--source-owner", "source-owner",
      "--target-owner", "target-owner",
      "--admin-id", "admin-1",
      "--reason", "consolidate duplicate projects",
      "--request-id", "project-merge-20260911-001",
      "--apply", "--confirm", "target->source",
    ])).toThrow("--confirm source->target")
  })

  it("parses every required apply safeguard", () => {
    expect(parseProjectMergeArgs([
      "--source-project", "source",
      "--target-project", "target",
      "--source-owner", "source-owner",
      "--target-owner", "target-owner",
      "--admin-id", "admin-1",
      "--reason", "consolidate duplicate projects",
      "--request-id", "project-merge-20260911-001",
      "--apply", "--confirm", "source->target",
    ])).toMatchObject({
      apply: true,
      confirmation: "source->target",
      expectedSourceOwnerId: "source-owner",
      expectedTargetOwnerId: "target-owner",
      adminUserId: "admin-1",
      reason: "consolidate duplicate projects",
      requestId: "project-merge-20260911-001",
    })
  })

  it.each([
    ["--source-owner", "source-owner"],
    ["--target-owner", "target-owner"],
    ["--admin-id", "admin-1"],
    ["--reason", "consolidate duplicate projects"],
    ["--request-id", "project-merge-20260911-001"],
  ])("rejects apply when %s is missing", (omittedFlag, omittedValue) => {
    const argv = [
      "--source-project", "source",
      "--target-project", "target",
      "--source-owner", "source-owner",
      "--target-owner", "target-owner",
      "--admin-id", "admin-1",
      "--reason", "consolidate duplicate projects",
      "--request-id", "project-merge-20260911-001",
      "--apply", "--confirm", "source->target",
    ]
    const index = argv.findIndex((value, position) =>
      value === omittedFlag && argv[position + 1] === omittedValue)
    argv.splice(index, 2)

    expect(() => parseProjectMergeArgs(argv)).toThrow(omittedFlag)
  })

  it("calls preview only for the default dry-run", async () => {
    const previewProjectMerge = vi.fn().mockResolvedValue(previewResult)
    const applyProjectMerge = vi.fn()
    vi.spyOn(console, "log").mockImplementation(() => undefined)

    const exitCode = await main([
      "--source-project", "source",
      "--target-project", "target",
    ], { previewProjectMerge, applyProjectMerge })

    expect(exitCode).toBe(0)
    expect(previewProjectMerge).toHaveBeenCalledTimes(1)
    expect(previewProjectMerge).toHaveBeenCalledWith(
      { sourceProjectId: "source", targetProjectId: "target" },
      expect.any(Object),
    )
    expect(applyProjectMerge).not.toHaveBeenCalled()
  })

  it("calls apply exactly once and never previews with valid safeguards", async () => {
    const previewProjectMerge = vi.fn()
    const applyProjectMerge = vi.fn().mockResolvedValue({ auditId: "audit-1" })
    vi.spyOn(console, "log").mockImplementation(() => undefined)

    const exitCode = await main([
      "--source-project", "source",
      "--target-project", "target",
      "--source-owner", "source-owner",
      "--target-owner", "target-owner",
      "--admin-id", "admin-1",
      "--reason", "consolidate duplicate projects",
      "--request-id", "project-merge-20260911-001",
      "--apply", "--confirm", "source->target",
    ], { previewProjectMerge, applyProjectMerge })

    expect(exitCode).toBe(0)
    expect(previewProjectMerge).not.toHaveBeenCalled()
    expect(applyProjectMerge).toHaveBeenCalledTimes(1)
    expect(applyProjectMerge).toHaveBeenCalledWith(expect.objectContaining({
      sourceProjectId: "source",
      targetProjectId: "target",
      expectedSourceOwnerId: "source-owner",
      expectedTargetOwnerId: "target-owner",
      adminUserId: "admin-1",
      requestId: "project-merge-20260911-001",
      confirmation: "source->target",
    }), expect.any(Object))
  })

  it("does not call either service when apply confirmation is invalid", async () => {
    const previewProjectMerge = vi.fn()
    const applyProjectMerge = vi.fn()
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const exitCode = await main([
      "--source-project", "source",
      "--target-project", "target",
      "--apply", "--confirm", "target",
    ], { previewProjectMerge, applyProjectMerge })

    expect(exitCode).toBe(1)
    expect(process.exitCode).toBe(1)
    expect(previewProjectMerge).not.toHaveBeenCalled()
    expect(applyProjectMerge).not.toHaveBeenCalled()
  })

  it("sets a failing exit code and redacts credentials from errors", async () => {
    const previewProjectMerge = vi.fn().mockRejectedValue(
      new Error("connect mysql://admin:secret@db.internal/customer"),
    )
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const exitCode = await main([
      "--source-project", "source",
      "--target-project", "target",
    ], { previewProjectMerge, applyProjectMerge: vi.fn() })

    expect(exitCode).toBe(1)
    expect(process.exitCode).toBe(1)
    expect(error).toHaveBeenCalledWith(
      "project merge failed:",
      expect.not.stringContaining("secret"),
    )
    expect(error).toHaveBeenCalledWith(
      "project merge failed:",
      expect.not.stringContaining("mysql://"),
    )
  })
})
