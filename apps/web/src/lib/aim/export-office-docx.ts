/**
 * AIM 交付物导出 Word（.docx）
 * 优先 OfficeCLI；未安装时用 JSZip 生成最小 OOXML，保证用户侧可下载。
 */

import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import JSZip from "jszip"

const execFileAsync = promisify(execFile)

export interface OfficeExportParagraph {
  text: string
  style: "Heading1" | "Heading2" | "Heading3" | "Normal"
}

export interface OfficeExportSection {
  heading: string
  content: string
}

export interface BuildDocxInput {
  title: string
  sections: OfficeExportSection[]
}

export interface BuildDocxResult {
  buffer: Buffer
  fileName: string
  engine: "officecli" | "jszip"
}

function officeCliBin(): string {
  return process.env.OFFICECLI_BIN?.trim() || "officecli"
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function stripMarkdownLight(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .trim()
}

/**
 * @description 将标题 + 各平台正文拆成 Word 段落
 */
export function buildOfficeExportParagraphs(input: BuildDocxInput): OfficeExportParagraph[] {
  const paragraphs: OfficeExportParagraph[] = []
  const title = input.title.trim() || "AIM 交付物"
  paragraphs.push({ text: title.slice(0, 200), style: "Heading1" })

  for (const section of input.sections) {
    const heading = section.heading.trim()
    const content = section.content.trim()
    if (!heading && !content) continue
    if (heading) paragraphs.push({ text: heading.slice(0, 200), style: "Heading2" })
    if (!content) continue

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue
      if (/^###\s+/.test(line)) {
        paragraphs.push({ text: stripMarkdownLight(line).slice(0, 500), style: "Heading3" })
        continue
      }
      if (/^##\s+/.test(line)) {
        paragraphs.push({ text: stripMarkdownLight(line).slice(0, 500), style: "Heading2" })
        continue
      }
      if (/^#\s+/.test(line)) {
        paragraphs.push({ text: stripMarkdownLight(line).slice(0, 500), style: "Heading1" })
        continue
      }
      paragraphs.push({ text: stripMarkdownLight(line).slice(0, 4000), style: "Normal" })
      if (paragraphs.length >= 400) return paragraphs
    }
  }

  return paragraphs
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim()
  return (cleaned || "aim-export").slice(0, 80)
}

function paragraphToOoxml(paragraph: OfficeExportParagraph): string {
  const style =
    paragraph.style === "Normal"
      ? ""
      : `<w:pPr><w:pStyle w:val="${paragraph.style}"/></w:pPr>`
  return `<w:p>${style}<w:r><w:t xml:space="preserve">${escapeXml(paragraph.text)}</w:t></w:r></w:p>`
}

/**
 * @description 无 OfficeCLI 时的最小 docx（JSZip）
 */
export async function buildDocxWithJszip(paragraphs: OfficeExportParagraph[]): Promise<Buffer> {
  const body = paragraphs.map(paragraphToOoxml).join("")
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr/>
  </w:body>
</w:document>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`

  const zip = new JSZip()
  zip.file("[Content_Types].xml", contentTypes)
  zip.folder("_rels")?.file(".rels", rels)
  const word = zip.folder("word")
  word?.file("document.xml", documentXml)
  word?.file("styles.xml", styles)
  word?.folder("_rels")?.file("document.xml.rels", docRels)

  const buffer = await zip.generateAsync({ type: "nodebuffer" })
  return Buffer.from(buffer)
}

async function buildDocxWithOfficeCli(paragraphs: OfficeExportParagraph[]): Promise<Buffer | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "aim-export-docx-"))
  const outPath = path.join(dir, "export.docx")
  const commandsPath = path.join(dir, "commands.json")
  try {
    await execFileAsync(officeCliBin(), ["create", outPath], {
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    })

    const commands = paragraphs.map((paragraph) => ({
      op: "add",
      path: "/body",
      type: "paragraph",
      props: {
        text: paragraph.text,
        style: paragraph.style,
      },
    }))
    await writeFile(commandsPath, JSON.stringify(commands), "utf8")
    await execFileAsync(
      officeCliBin(),
      ["batch", outPath, "--input", commandsPath],
      { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 },
    )
    // 确保落盘（部分版本 batch 后仍需 close/save；读文件即校验）
    const buffer = await readFile(outPath)
    return buffer.length > 0 ? buffer : null
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * @description 生成 AIM 交付 Word 文件
 */
export async function buildAimExportDocx(input: BuildDocxInput): Promise<BuildDocxResult> {
  const paragraphs = buildOfficeExportParagraphs(input)
  if (paragraphs.length === 0) {
    throw new Error("没有可导出的正文")
  }

  const viaOfficeCli = await buildDocxWithOfficeCli(paragraphs)
  const buffer = viaOfficeCli ?? (await buildDocxWithJszip(paragraphs))
  return {
    buffer,
    fileName: `${sanitizeFileName(input.title)}.docx`,
    engine: viaOfficeCli ? "officecli" : "jszip",
  }
}
