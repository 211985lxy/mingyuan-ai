import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  applySelectionReplacement,
  applyFirstMatchingStructureToReference,
  applyStructureLabelsToReference,
  clampEditorPanelWidth,
  extractEditorDraftFromAssistantText,
  extractReplacementDraft,
  extractStructureLabelsFromAnalysis,
  formatEditorContextForPrompt,
} from "@/lib/aim-editor"

describe("aim editor helpers", () => {
  it("replaces only the selected range", () => {
    expect(applySelectionReplacement("开头中间结尾", { start: 2, end: 4 }, "替换")).toBe("开头替换结尾")
  })

  it("does not replace when selection is empty", () => {
    expect(applySelectionReplacement("原文", { start: 1, end: 1 }, "替换")).toBe("原文")
  })

  it("clamps editor panel width", () => {
    expect(clampEditorPanelWidth(100)).toBe(280)
    expect(clampEditorPanelWidth(520)).toBe(460)
    expect(clampEditorPanelWidth(2000)).toBe(460)
  })

  it("extracts replacement draft from AI response", () => {
    const text = "修改思路：\n加强冲突。\n\n替换稿：\n这是一段新稿。\n"
    expect(extractReplacementDraft(text)).toBe("这是一段新稿。")
  })

  it("extracts the final editor draft from assistant text", () => {
    const text = [
      "整体可感知重写比例约35%。",
      "",
      "## 编辑区 - 最终版口播文案",
      "第一句。",
      "",
      "第二句。",
    ].join("\n")

    expect(extractEditorDraftFromAssistantText(text)).toBe("第一句。\n\n第二句。")
  })

  it("returns empty replacement when AI response has no replacement marker", () => {
    expect(extractReplacementDraft("只有修改建议，没有替换稿。")).toBe("")
  })

  it("nudges the editor toward targeted edits without forbidding rewrites", () => {
    const prompt = formatEditorContextForPrompt({
      action: "用户追问",
      draftText: "第一段原文。",
    })

    expect(prompt).toContain("优先做定点修改")
    expect(prompt).toContain("帮助客户沉淀可以进化的知识库资产")
    expect(prompt).toContain("替换稿只处理用户点名要改的地方")
    expect(prompt).toContain("不要替换、删改用户没有点名的词句")
    expect(prompt).toContain("替换稿只能包含新的开头段落")
    expect(prompt).toContain("修改思路可以给开头、结构、结尾等简短意见")
    expect(prompt).toContain("不要把未点名建议直接写进替换稿")
    expect(prompt).toContain("确实需要整段重写时要说明原因")
  })

  it("formats planning editor context as strategy plan edits", () => {
    const prompt = formatEditorContextForPrompt({
      action: "用户追问",
      documentType: "plan",
      referenceLabel: "参考材料",
      draftLabel: "我的策划案",
      referenceSelection: "客户业务材料",
      draftSelection: "旧定位判断",
      draftText: "当前策划案",
    })

    expect(prompt).toContain("策划案修改上下文")
    expect(prompt).not.toContain("文案编辑上下文")
    expect(prompt).toContain("参考材料选区")
    expect(prompt).toContain("我的策划案选区")
    expect(prompt).toContain("我的策划案当前稿")
    expect(prompt).toContain("不要按口播文案方式改写")
  })

  it("keeps copy editor labels while adding planning labels in AIM page", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/aim-editor-labels.ts"), "utf8")

    expect(source).toContain("策划案编辑")
    expect(source).toContain("我的策划案")
    expect(source).toContain("文案编辑")
    expect(source).toContain("我的稿子")
  })

  it("extracts structure labels from the structure analysis markdown", () => {
    const labels = extractStructureLabelsFromAnalysis([
      "## 结构拆解",
      "### 开头前10秒：反常识判断",
      "先抛冲突。",
      "### 中段：案例递进",
      "进入案例。",
      "## 心理拆解",
      "### 焦虑触发",
    ].join("\n"))
    expect(labels).toEqual(["开头前10秒：反常识判断", "中段：案例递进"])
  })

  it("extracts structure labels from markdown list annotations", () => {
    const labels = extractStructureLabelsFromAnalysis([
      "## 结构拆解",
      "- 开头前10秒：先用反常识判断切入",
      "- 中段框架：用案例解释为什么",
      "## 心理拆解",
      "- 焦虑触发：制造落差",
    ].join("\n"))
    expect(labels).toEqual(["开头前10秒：先用反常识判断切入", "中段框架：用案例解释为什么"])
  })

  it("embeds matched structure labels in the benchmark reference", () => {
    const reference = "第一段原文。第二段原文。第三段原文。"
    const analysis = [
      "## 结构拆解",
      "### 开头前10秒：制造冲突",
      "第一段原文。",
      "### 中段：解释原因",
      "第二段原文。",
      "## 心理拆解",
      "### 情绪",
      "第三段原文。",
    ].join("\n")
    expect(applyStructureLabelsToReference(reference, analysis)).toBe([
      "## 开头前10秒：制造冲突",
      "第一段原文。",
      "",
      "## 中段：解释原因",
      "第二段原文。第三段原文。",
    ].join("\n"))
  })

  it("embeds numbered structure labels using the 内容 quote", () => {
    const reference = "你们啊，多跟AI闲聊，少跟身边乱七八糟的人扯皮。因为AI它就是能力最强。"
    const analysis = [
      "1. 开头（0-10秒）：制造冲突，建立权威",
      "内容：“你们啊，多跟AI闲聊，少跟身边乱七八糟的人扯皮。因为AI它就是...能力最强。”",
      "结构分析：",
      "指令式开头。",
    ].join("\n")
    expect(applyStructureLabelsToReference(reference, analysis)).toBe([
      "## 开头（0-10秒）：制造冲突，建立权威",
      reference,
    ].join("\n"))
  })

  it("embeds structure labels using bold markdown 内容 quote", () => {
    const reference = "你们啊，多跟AI闲聊，少跟身边乱七八糟的人扯皮。因为AI它就是我就拿加mni举例，加mni就是能力最强。"
    const analysis = [
      "## 结构拆解",
      "### 1. 开头（0-10秒）：制造冲突，建立权威",
      "- **内容**：“你们啊，多跟AI闲聊，少跟身边乱七八糟的人扯皮。因为AI它就是...能力最强。”",
      "- **结构分析**：指令式开头。",
    ].join("\n")
    expect(applyStructureLabelsToReference(reference, analysis)).toContain("## 1. 开头（0-10秒）：制造冲突，建立权威")
  })

  it("does not guess benchmark structure when analysis has no matching quote", () => {
    const reference = "第一段原文。第二段原文。"
    const analysis = "## 结构拆解\n### 开头：判断\n这里没有原文片段。"
    expect(applyStructureLabelsToReference(reference, analysis)).toBe(reference)
  })

  it("tries later structure sources when the first one does not match", () => {
    const reference = "你们啊，多跟AI闲聊，少跟身边乱七八糟的人扯皮。"
    const bad = "## 结构拆解\n### 开头\n没有原文片段。"
    const good = "1. 开头（0-10秒）：制造冲突\n内容：“你们啊，多跟AI闲聊，少跟身边乱七八糟的人扯皮。”"
    expect(applyFirstMatchingStructureToReference(reference, [bad, good])).toContain("## 开头（0-10秒）：制造冲突")
  })

  it("splits sequential body methods when analysis only marks the broad body section", () => {
    const reference = [
      "但是直接问AI问题，其实是效率最低的玩法。",
      "第一个狩猎法，从头到尾的去啃一本书，那是学生思维。",
      "第二，有句狠话是这么说的，如果你有句话不能讲给6岁的小孩儿听。",
      "第三招，辩论法。这个太爽了。",
      "未来最强的人不是会问AI的人。",
    ].join("")
    const analysis = [
      "## 结构拆解",
      "### 正文第一部分：打破旧认知，建立新框架",
      "内容：但是直接问AI问题，其实是效率最低的玩法。",
      "### 结尾：价值升华",
      "内容：未来最强的人不是会问AI的人。",
    ].join("\n")

    const result = applyStructureLabelsToReference(reference, analysis)

    expect(result).toContain("## 正文-心法一：狩猎法")
    expect(result).toContain("## 正文-心法二：反推法")
    expect(result).toContain("## 正文-心法三：辩论法")
  })
})
