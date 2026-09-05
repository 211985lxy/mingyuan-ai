import { describe, expect, it } from "vitest"

import { isLikelyScannedPdf } from "@/lib/aim/scanned-pdf-ocr"

describe("isLikelyScannedPdf", () => {
  it("flags pdf with almost no text layer as scanned", () => {
    expect(isLikelyScannedPdf({ fileName: "scan.pdf", textLength: 5 })).toBe(true)
    expect(isLikelyScannedPdf({ fileName: "SCAN.PDF", textLength: 0 })).toBe(true)
  })

  it("does not flag text-rich pdf", () => {
    expect(isLikelyScannedPdf({ fileName: "doc.pdf", textLength: 5000 })).toBe(false)
  })

  it("only applies to pdf files", () => {
    expect(isLikelyScannedPdf({ fileName: "notes.txt", textLength: 0 })).toBe(false)
    expect(isLikelyScannedPdf({ fileName: "report.docx", textLength: 10 })).toBe(false)
  })
})
