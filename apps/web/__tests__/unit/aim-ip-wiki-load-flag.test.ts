import { describe, expect, it } from "vitest"

import { resolveIpWikiLoadFlag } from "@/lib/aim-harness/context/load-generation-blocks"

describe("resolveIpWikiLoadFlag（IP Wiki 不再无条件自动加载）", () => {
  it("does not load for light edits even when a project is bound", () => {
    expect(resolveIpWikiLoadFlag({
      projectId: "proj-1",
      rawInput: "把这篇的开头改得更口语一点",
      useKnowledge: true,
      runtimeTask: "light_edit",
    })).toBe(false)
  })

  it("loads when the user explicitly asks to combine project materials", () => {
    expect(resolveIpWikiLoadFlag({
      projectId: "proj-1",
      rawInput: "结合项目资料写一篇口播",
      useKnowledge: false,
      runtimeTask: "light_edit",
    })).toBe(true)
    expect(resolveIpWikiLoadFlag({
      projectId: "proj-1",
      rawInput: "参考知识库里的案例改写",
      useKnowledge: false,
      runtimeTask: "light_edit",
    })).toBe(true)
  })

  it("loads for confirmed knowledge-needing creation tasks, but never without a project", () => {
    expect(resolveIpWikiLoadFlag({
      projectId: "proj-1",
      rawInput: "写一篇获客口播",
      useKnowledge: true,
      runtimeTask: "new_copy",
    })).toBe(true)
    expect(resolveIpWikiLoadFlag({
      projectId: null,
      rawInput: "写一篇获客口播",
      useKnowledge: true,
      runtimeTask: "new_copy",
    })).toBe(false)
  })

  it("does not load for a plain creation request without project-fact signals", () => {
    expect(resolveIpWikiLoadFlag({
      projectId: "proj-1",
      rawInput: "写一篇获客口播",
      useKnowledge: false,
      runtimeTask: "new_copy",
    })).toBe(false)
  })
})
