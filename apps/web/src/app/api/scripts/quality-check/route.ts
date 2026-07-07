import { NextRequest, NextResponse } from "next/server"
import { runQualityCheck, runQualityGateWithRewrite } from "@/lib/quality-gate"
import { withUserAuth } from "@/lib/user-auth"
import { runDouyinPublishCheck } from "@/lib/douyin-publish-check"

/**
 * POST /api/scripts/quality-check
 * 四维质量门控 API
 */
export const POST = withUserAuth(async (request: NextRequest) => {
  try {
    const body = await request.json()
    const {
      content,
      topicTitle,
      openingType,
      structure,
      endingType,
      persona,
      autoRewrite = false,
      publishPlatform,
    } = body ?? {}

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "缺少文案内容 (content)" },
        { status: 400 }
      )
    }

    if (topicTitle != null && typeof topicTitle !== "string") {
      return NextResponse.json(
        { error: "topicTitle 必须是字符串" },
        { status: 400 }
      )
    }

    if (openingType != null && typeof openingType !== "string") {
      return NextResponse.json(
        { error: "openingType 必须是字符串" },
        { status: 400 }
      )
    }

    if (structure != null && typeof structure !== "string") {
      return NextResponse.json(
        { error: "structure 必须是字符串" },
        { status: 400 }
      )
    }

    if (endingType != null && typeof endingType !== "string") {
      return NextResponse.json(
        { error: "endingType 必须是字符串" },
        { status: 400 }
      )
    }

    if (persona != null && typeof persona !== "object" && typeof persona !== "string") {
      return NextResponse.json(
        { error: "persona 必须是对象或字符串" },
        { status: 400 }
      )
    }

    if (typeof autoRewrite !== "boolean") {
      return NextResponse.json(
        { error: "autoRewrite 必须是布尔值" },
        { status: 400 }
      )
    }

    if (publishPlatform != null && publishPlatform !== "douyin") {
      return NextResponse.json(
        { error: "publishPlatform 暂只支持 douyin" },
        { status: 400 }
      )
    }

    const input = {
      content,
      topicTitle,
      openingType,
      structure,
      endingType,
      persona: typeof persona === "string"
        ? { oneLiner: persona }
        : persona
        ? {
            roleType:
              typeof persona.roleType === "string" ? persona.roleType : undefined,
            oneLiner:
              typeof persona.oneLiner === "string" ? persona.oneLiner : undefined,
            toneOfVoice:
              typeof persona.toneOfVoice === "string"
                ? persona.toneOfVoice
                : undefined,
          }
        : undefined,
    }

    if (autoRewrite) {
      const { content: finalContent, report } = await runQualityGateWithRewrite(input)
      const publishCheck = publishPlatform === "douyin"
        ? runDouyinPublishCheck(finalContent)
        : undefined
      return NextResponse.json({
        success: true,
        data: {
          originalContent: content,
          content: finalContent,
          rewritten: finalContent !== content,
          report,
          publishCheck,
        },
      })
    } else {
      const report = await runQualityCheck(input)
      const publishCheck = publishPlatform === "douyin"
        ? runDouyinPublishCheck(content)
        : undefined
      return NextResponse.json({
        success: true,
        data: { content, report, publishCheck },
      })
    }
  } catch (error) {
    console.error("[quality-check] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "质量检测失败" },
      { status: 500 }
    )
  }
})
