import { createElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ThinkingProcessPanel } from "@/components/aim/thinking-process-panel"
import type { AimTraceStreamCallbacks } from "@/components/aim/aim-trace-sse"

const connectAimTraceStream = vi.fn()

vi.mock("@/components/aim/aim-trace-sse", async () => {
  const actual = await vi.importActual<typeof import("@/components/aim/aim-trace-sse")>(
    "@/components/aim/aim-trace-sse",
  )
  return {
    ...actual,
    connectAimTraceStream: (...args: unknown[]) => connectAimTraceStream(...args),
  }
})

describe("ThinkingProcessPanel live reasoning", () => {
  it("流式展示思考，结束后折成一行，换线路会标第 N 次尝试", async () => {
    const user = userEvent.setup()
    let callbacks: AimTraceStreamCallbacks | undefined
    connectAimTraceStream.mockImplementation((_traceId: string, cbs: AimTraceStreamCallbacks) => {
      callbacks = cbs
      return () => undefined
    })

    render(createElement(ThinkingProcessPanel, { traceId: "trace-ui", type: "chat" }))
    expect(connectAimTraceStream).toHaveBeenCalled()

    act(() => {
      callbacks?.onReasoning?.({ text: "先拆需求", attempt: 1 })
    })
    expect(screen.getByText(/思考中/)).toBeInTheDocument()
    expect(screen.getByText(/先拆需求/)).toBeInTheDocument()

    act(() => {
      callbacks?.onReasoning?.({ reset: true, attempt: 2, text: "换路再想" })
    })
    expect(screen.getByText(/第 2 次尝试/)).toBeInTheDocument()
    expect(screen.getByText(/换路再想/)).toBeInTheDocument()
    expect(screen.queryByText(/先拆需求/)).not.toBeInTheDocument()

    act(() => {
      callbacks?.onReasoning?.({ text: "", done: true, attempt: 2 })
    })
    expect(await screen.findByRole("button", { name: /思考过程/ })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /思考过程/ }))
    expect(screen.getByText(/换路再想/)).toBeInTheDocument()
  })
})
