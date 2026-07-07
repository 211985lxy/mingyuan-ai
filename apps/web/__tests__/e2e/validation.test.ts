import { describe, it, expect } from "vitest"
import { validateTrainingVideo, validateMaterial, validateVoiceAudio } from "@/lib/validation"

describe("validateTrainingVideo", () => {
  it("accepts valid fast clone video", () => {
    const r = validateTrainingVideo("fast", { duration: 30, size: 100 * 1024 * 1024, format: "mp4" })
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects too short fast clone", () => {
    const r = validateTrainingVideo("fast", { duration: 3 })
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain("at least 5")
  })

  it("rejects too long fast clone", () => {
    const r = validateTrainingVideo("fast", { duration: 90 })
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain("at most 60")
  })

  it("accepts valid professional clone", () => {
    const r = validateTrainingVideo("professional", { duration: 60, size: 500 * 1024 * 1024, format: "mov" })
    expect(r.valid).toBe(true)
  })

  it("rejects professional clone under 30s", () => {
    const r = validateTrainingVideo("professional", { duration: 20 })
    expect(r.valid).toBe(false)
  })

  it("accepts valid image clone", () => {
    const r = validateTrainingVideo("image", { width: 500, height: 600, size: 2 * 1024 * 1024, format: "jpg" })
    expect(r.valid).toBe(true)
  })

  it("rejects image too small", () => {
    const r = validateTrainingVideo("image", { width: 100, height: 100 })
    expect(r.valid).toBe(false)
  })

  it("rejects image bad aspect ratio", () => {
    const r = validateTrainingVideo("image", { width: 2000, height: 400 })
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain("Aspect ratio")
  })

  it("rejects unknown clone type", () => {
    const r = validateTrainingVideo("unknown", {})
    expect(r.valid).toBe(false)
  })

  it("rejects wrong video format", () => {
    const r = validateTrainingVideo("fast", { format: "avi" })
    expect(r.valid).toBe(false)
  })
})

describe("validateMaterial", () => {
  it("accepts valid image", () => {
    const r = validateMaterial("image", { size: 2 * 1024 * 1024, format: "jpg" })
    expect(r.valid).toBe(true)
  })

  it("rejects video too long", () => {
    const r = validateMaterial("video", { duration: 90 })
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain("under 60")
  })

  it("rejects audio too large", () => {
    const r = validateMaterial("audio", { size: 200 * 1024 * 1024 })
    expect(r.valid).toBe(false)
  })

  it("rejects unknown type", () => {
    const r = validateMaterial("pdf", {})
    expect(r.valid).toBe(false)
  })
})

describe("validateVoiceAudio", () => {
  it("accepts valid v1 audio", () => {
    const r = validateVoiceAudio("v1", { duration: 60, size: 5 * 1024 * 1024, format: "mp3" })
    expect(r.valid).toBe(true)
  })

  it("rejects s1 audio too short", () => {
    const r = validateVoiceAudio("s1", { duration: 5 })
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain("at least 10")
  })

  it("accepts s3 at minimum", () => {
    const r = validateVoiceAudio("s3", { duration: 10 })
    expect(r.valid).toBe(true)
  })

  it("rejects wrong format", () => {
    const r = validateVoiceAudio("v1", { format: "ogg" })
    expect(r.valid).toBe(false)
  })

  it("rejects unknown model", () => {
    const r = validateVoiceAudio("x99", {})
    expect(r.valid).toBe(false)
  })
})
