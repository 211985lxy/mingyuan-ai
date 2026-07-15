import { describe, expect, it } from "vitest"
import { buildTopicProjectSource } from "@/lib/topics/chat-context"

describe("topic chat context", () => {
  it("builds project source from available business fields", () => {
    expect(buildTopicProjectSource({
      id: "project-1",
      name: "测试项目",
      industry: "制造业",
      targetCustomer: "工厂老板",
      offer: "设备升级",
      deliveryGoal: null,
    })).toBe([
      "行业：制造业",
      "目标客户：工厂老板",
      "产品/服务：设备升级",
    ].join("\n"))
  })
})
