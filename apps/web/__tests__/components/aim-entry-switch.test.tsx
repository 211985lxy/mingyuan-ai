import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimEntrySwitch } from "@/features/aim/components/aim-entry-switch"

const projects = [
  { id: "project-1", name: "Founder IP", status: "active" },
]

describe("AimEntrySwitch", () => {
  it("keeps both flexible chat and the IP operating loop visible", () => {
    render(<AimEntrySwitch projects={projects} onFlexible={vi.fn()} onOperating={vi.fn()} />)
    expect(screen.getByRole("button", { name: /directly ask aim/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /run ip loop/i })).toBeInTheDocument()
  })

  it("opens flexible chat immediately", async () => {
    const onFlexible = vi.fn()
    render(<AimEntrySwitch projects={projects} onFlexible={onFlexible} onOperating={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: /directly ask aim/i }))
    expect(onFlexible).toHaveBeenCalledTimes(1)
  })

  it("starts the operating loop with the selected project", async () => {
    const onOperating = vi.fn()
    render(<AimEntrySwitch projects={projects} selectedProjectId="project-1" onFlexible={vi.fn()} onOperating={onOperating} />)
    await userEvent.click(screen.getByRole("button", { name: /run ip loop/i }))
    expect(onOperating).toHaveBeenCalledWith("project-1")
  })

  it("requires a project before entering the operating loop", () => {
    render(<AimEntrySwitch projects={[]} onFlexible={vi.fn()} onOperating={vi.fn()} />)
    expect(screen.getByRole("button", { name: /run ip loop/i })).toBeDisabled()
  })
})
