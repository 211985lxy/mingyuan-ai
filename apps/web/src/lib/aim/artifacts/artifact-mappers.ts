/**
 * 产出物映射器框架（WP-7）。
 *
 * 每个智能体只需提供：
 * - Artifact Mapper：从 AIM 生成结果确定性映射为 AimArtifactSpec[]
 * - 模板：文档/表格结构模板
 * - 验证器：payload 结构校验
 * - 目标资源配置：使用哪个 folder/table
 *
 * 不复制调度器/状态机/CLI runner/权限/Trace。
 *
 * 按优先级：
 * 1. content_producer → 文案 Doc + 内容日历 Base
 * 2. work_editor → 编辑稿 Doc + 配图 Drive
 * 3. content_review → 质检报告 Doc + Base
 * 4. business_system_diagnosis → 诊断报告 Doc + Base + Sheets
 * 5. content_growth → 选题池/日历/复盘 Base
 * 6. consulting_delivery → 交付方案 Doc + 任务 Base + Drive
 */
import type {
  AimArtifactSpec,
  FeishuAssetKind,
  ArtifactRole,
  PermissionProfile,
} from "@/lib/aim/artifacts/contracts"
import { buildArtifactKey } from "@/lib/aim/artifacts/contracts"

// ─── 映射器接口 ──────────────────────────────────────────────────────────────

/** 映射器输入：AIM 生成结果的通用投影。 */
export interface ArtifactMapperInput {
  /** AimGeneration.id */
  generationId: string
  /** 关联的经营事项飞书记录 ID */
  workItemRecordId: string
  /** 所属项目 ID */
  projectId: string
  /** 智能体 ID */
  agentId: string
  /** 生成结果原始内容（Markdown 或结构化数据） */
  rawCopy: string
  /** taskSpec（智能体特定的结构化数据） */
  taskSpec: Record<string, unknown>
}

/** 映射器定义。 */
export interface ArtifactMapper {
  /** 智能体 ID。 */
  agentId: string
  /** 映射函数：从生成结果确定性映射为资产规格列表。 */
  map(input: ArtifactMapperInput): AimArtifactSpec[]
}

// ─── 映射器注册表 ────────────────────────────────────────────────────────────

const mapperRegistry = new Map<string, ArtifactMapper>()

/**
 * 注册映射器。
 */
export function registerArtifactMapper(mapper: ArtifactMapper): void {
  mapperRegistry.set(mapper.agentId, mapper)
}

/**
 * 获取映射器。
 */
export function getArtifactMapper(agentId: string): ArtifactMapper | undefined {
  return mapperRegistry.get(agentId)
}

/**
 * 映射生成结果为资产规格。
 * 无对应映射器时返回空数组（不落地）。
 */
export function mapGenerationToArtifacts(input: ArtifactMapperInput): AimArtifactSpec[] {
  const mapper = mapperRegistry.get(input.agentId)
  if (!mapper) return []
  return mapper.map(input)
}

// ─── 辅助构造函数 ────────────────────────────────────────────────────────────

function buildSpec(input: {
  generationId: string
  workItemRecordId: string
  projectId: string
  kind: FeishuAssetKind
  role: ArtifactRole
  title: string
  required: boolean
  permissionProfile: PermissionProfile
  payload: unknown
  suffix?: string
}): AimArtifactSpec {
  return {
    artifactKey: buildArtifactKey(input.kind, input.workItemRecordId, input.suffix),
    generationId: input.generationId,
    workItemRecordId: input.workItemRecordId,
    projectId: input.projectId,
    kind: input.kind,
    role: input.role,
    title: input.title,
    required: input.required,
    permissionProfile: input.permissionProfile,
    payload: input.payload,
  }
}

// ─── 1. content_producer 映射器 ─────────────────────────────────────────────

registerArtifactMapper({
  agentId: "content_producer",
  map(input) {
    const specs: AimArtifactSpec[] = []
    const title = String(input.taskSpec.contentTitle ?? "文案产出")

    // 主资产：文案 Doc
    specs.push(buildSpec({
      generationId: input.generationId,
      workItemRecordId: input.workItemRecordId,
      projectId: input.projectId,
      kind: "feishu_doc",
      role: "primary",
      title: `文案 · ${title}`,
      required: true,
      permissionProfile: "project_team",
      payload: { markdown: input.rawCopy },
      suffix: "doc",
    }))

    // 次要资产：内容日历 Base 记录
    specs.push(buildSpec({
      generationId: input.generationId,
      workItemRecordId: input.workItemRecordId,
      projectId: input.projectId,
      kind: "feishu_base_records",
      role: "secondary",
      title: `内容日历 · ${title}`,
      required: false,
      permissionProfile: "internal",
      payload: {
        fields: {
          "标题": title,
          "状态": "待审核",
          "来源": "AIM content_producer",
          "生成时间": new Date().toISOString(),
          "关联记录": input.workItemRecordId,
        },
      },
      suffix: "calendar",
    }))

    return specs
  },
})

// ─── 2. work_editor 映射器 ──────────────────────────────────────────────

registerArtifactMapper({
  agentId: "work_editor",
  map(input) {
    const specs: AimArtifactSpec[] = []
    const title = String(input.taskSpec.articleTitle ?? "深度稿件")

    // 主资产：编辑稿 Doc
    specs.push(buildSpec({
      generationId: input.generationId,
      workItemRecordId: input.workItemRecordId,
      projectId: input.projectId,
      kind: "feishu_doc",
      role: "primary",
      title: `编辑稿 · ${title}`,
      required: true,
      permissionProfile: "project_team",
      payload: { markdown: input.rawCopy },
      suffix: "doc",
    }))

    // 次要资产：配图 Drive（如果 taskSpec 中有图片路径）
    const images = input.taskSpec.imagePaths as string[] | undefined
    if (images?.length) {
      for (let i = 0; i < images.length; i++) {
        specs.push(buildSpec({
          generationId: input.generationId,
          workItemRecordId: input.workItemRecordId,
          projectId: input.projectId,
          kind: "feishu_drive_file",
          role: "secondary",
          title: `配图 ${i + 1}`,
          required: false,
          permissionProfile: "project_team",
          payload: { filePath: images[i], fileName: `image_${i + 1}.png` },
          suffix: `img_${i}`,
        }))
      }
    }

    return specs
  },
})

// ─── 3. content_review 映射器 ───────────────────────────────────────────────

registerArtifactMapper({
  agentId: "content_review",
  map(input) {
    const specs: AimArtifactSpec[] = []
    const title = String(input.taskSpec.reviewTarget ?? "内容质检")

    // 主资产：质检报告 Doc
    specs.push(buildSpec({
      generationId: input.generationId,
      workItemRecordId: input.workItemRecordId,
      projectId: input.projectId,
      kind: "feishu_doc",
      role: "primary",
      title: `质检报告 · ${title}`,
      required: true,
      permissionProfile: "internal",
      payload: { markdown: input.rawCopy },
      suffix: "doc",
    }))

    // 次要资产：质检记录 Base
    specs.push(buildSpec({
      generationId: input.generationId,
      workItemRecordId: input.workItemRecordId,
      projectId: input.projectId,
      kind: "feishu_base_records",
      role: "secondary",
      title: `质检记录 · ${title}`,
      required: false,
      permissionProfile: "internal",
      payload: {
        fields: {
          "标题": title,
          "质检结果": String(input.taskSpec.verdict ?? "待确认"),
          "来源": "AIM content_review",
          "生成时间": new Date().toISOString(),
          "关联记录": input.workItemRecordId,
        },
      },
      suffix: "record",
    }))

    return specs
  },
})

// ─── 4. business_system_diagnosis 映射器 ────────────────────────────────────

registerArtifactMapper({
  agentId: "business_system_diagnosis",
  map(input) {
    const specs: AimArtifactSpec[] = []
    const title = String(input.taskSpec.diagnosisTitle ?? "经营诊断")

    // 主资产：诊断报告 Doc
    specs.push(buildSpec({
      generationId: input.generationId,
      workItemRecordId: input.workItemRecordId,
      projectId: input.projectId,
      kind: "feishu_doc",
      role: "primary",
      title: `诊断报告 · ${title}`,
      required: true,
      permissionProfile: "project_team",
      payload: { markdown: input.rawCopy },
      suffix: "doc",
    }))

    // 次要资产：诊断数据 Base
    specs.push(buildSpec({
      generationId: input.generationId,
      workItemRecordId: input.workItemRecordId,
      projectId: input.projectId,
      kind: "feishu_base_records",
      role: "secondary",
      title: `诊断数据 · ${title}`,
      required: false,
      permissionProfile: "internal",
      payload: {
        fields: {
          "标题": title,
          "诊断类型": String(input.taskSpec.diagnosisType ?? "综合"),
          "来源": "AIM business_system_diagnosis",
          "生成时间": new Date().toISOString(),
          "关联记录": input.workItemRecordId,
        },
      },
      suffix: "data",
    }))

    // 次要资产：指标矩阵 Sheets（如果有结构化指标）
    const metrics = input.taskSpec.metricsMatrix as { headers: string[]; rows: unknown[][] } | undefined
    if (metrics?.headers?.length) {
      specs.push(buildSpec({
        generationId: input.generationId,
        workItemRecordId: input.workItemRecordId,
        projectId: input.projectId,
        kind: "feishu_sheet",
        role: "secondary",
        title: `指标矩阵 · ${title}`,
        required: false,
        permissionProfile: "internal",
        payload: metrics,
        suffix: "matrix",
      }))
    }

    return specs
  },
})

// ─── 5. content_growth 映射器 ───────────────────────────────────────────────

registerArtifactMapper({
  agentId: "content_growth",
  map(input) {
    const specs: AimArtifactSpec[] = []
    const title = String(input.taskSpec.growthTitle ?? "内容增长")

    // 主资产：选题池/日历 Base
    specs.push(buildSpec({
      generationId: input.generationId,
      workItemRecordId: input.workItemRecordId,
      projectId: input.projectId,
      kind: "feishu_base_records",
      role: "primary",
      title: `选题池 · ${title}`,
      required: true,
      permissionProfile: "project_team",
      payload: {
        fields: {
          "标题": title,
          "类型": String(input.taskSpec.growthType ?? "选题"),
          "来源": "AIM content_growth",
          "生成时间": new Date().toISOString(),
          "关联记录": input.workItemRecordId,
        },
      },
      suffix: "pool",
    }))

    // 次要资产：复盘 Doc（如果有复盘内容）
    if (input.rawCopy && input.rawCopy.length > 50) {
      specs.push(buildSpec({
        generationId: input.generationId,
        workItemRecordId: input.workItemRecordId,
        projectId: input.projectId,
        kind: "feishu_doc",
        role: "secondary",
        title: `复盘 · ${title}`,
        required: false,
        permissionProfile: "internal",
        payload: { markdown: input.rawCopy },
        suffix: "review",
      }))
    }

    return specs
  },
})

// ─── 6. consulting_delivery 映射器 ──────────────────────────────────────────

registerArtifactMapper({
  agentId: "consulting_delivery",
  map(input) {
    const specs: AimArtifactSpec[] = []
    const title = String(input.taskSpec.deliveryTitle ?? "交付方案")

    // 主资产：交付方案 Doc
    specs.push(buildSpec({
      generationId: input.generationId,
      workItemRecordId: input.workItemRecordId,
      projectId: input.projectId,
      kind: "feishu_doc",
      role: "primary",
      title: `交付方案 · ${title}`,
      required: true,
      permissionProfile: "client_delivery",
      payload: { markdown: input.rawCopy },
      suffix: "doc",
    }))

    // 次要资产：任务清单 Base
    specs.push(buildSpec({
      generationId: input.generationId,
      workItemRecordId: input.workItemRecordId,
      projectId: input.projectId,
      kind: "feishu_base_records",
      role: "secondary",
      title: `任务清单 · ${title}`,
      required: false,
      permissionProfile: "project_team",
      payload: {
        fields: {
          "标题": title,
          "状态": "待启动",
          "来源": "AIM consulting_delivery",
          "生成时间": new Date().toISOString(),
          "关联记录": input.workItemRecordId,
        },
      },
      suffix: "tasks",
    }))

    // 次要资产：交付文件 Drive（如果有附件路径）
    const attachments = input.taskSpec.attachmentPaths as string[] | undefined
    if (attachments?.length) {
      for (let i = 0; i < attachments.length; i++) {
        const fileName = attachments[i].split("/").pop() ?? `attachment_${i}`
        specs.push(buildSpec({
          generationId: input.generationId,
          workItemRecordId: input.workItemRecordId,
          projectId: input.projectId,
          kind: "feishu_drive_file",
          role: "secondary",
          title: `交付文件 · ${fileName}`,
          required: false,
          permissionProfile: "client_delivery",
          payload: { filePath: attachments[i], fileName },
          suffix: `file_${i}`,
        }))
      }
    }

    return specs
  },
})
