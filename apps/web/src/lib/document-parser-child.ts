import { fork, type ChildProcess } from "node:child_process"
import type { WorkerRequest, WorkerResponse } from "./document-parser-worker"
import { DocumentParseError } from "./document-parser-errors"

function rejectChild(
  reject: (err: Error) => void,
  message: string,
  code = "PARSE_CHILD_FAILED",
) {
  reject(new DocumentParseError(message, { code, status: 422 }))
}

function attachWorkerHandlers(input: {
  child: ChildProcess
  timeoutMs: number
  resolve: (text: string) => void
  reject: (err: Error) => void
}): void {
  let settled = false
  const finish = (fn: () => void) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    fn()
  }

  const timer = setTimeout(() => {
    finish(() => {
      input.child.kill("SIGKILL")
      rejectChild(input.reject, "文档解析超时（60s）", "PARSE_TIMEOUT")
    })
  }, input.timeoutMs)

  input.child.on("message", (msg: WorkerResponse) => {
    finish(() => {
      input.child.kill()
      if (!msg || typeof msg !== "object") {
        rejectChild(input.reject, "子进程返回异常")
        return
      }
      if (msg.ok) input.resolve(msg.text)
      else rejectChild(input.reject, msg.error || "子进程解析失败", msg.code || "PARSE_CHILD_FAILED")
    })
  })

  input.child.on("error", (err) => {
    finish(() => rejectChild(input.reject, err.message || "子进程启动失败"))
  })

  input.child.on("exit", (code, signal) => {
    finish(() =>
      rejectChild(input.reject, `子进程异常退出 code=${code} signal=${signal}`),
    )
  })
}

export async function forkDocumentParseWorker(input: {
  workerScript: string
  filePath: string
  fileName: string
  timeoutMs: number
  execArgv: string[]
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = fork(input.workerScript, [], {
      execArgv: input.execArgv,
      timeout: input.timeoutMs,
    })
    attachWorkerHandlers({ child, timeoutMs: input.timeoutMs, resolve, reject })
    const req: WorkerRequest = { filePath: input.filePath, fileName: input.fileName }
    child.send(req)
  })
}
