import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

const control = JSON.parse(readFileSync(new URL("../.release-control.json", import.meta.url), "utf8"))
const branch = git("branch", "--show-current")
const head = git("rev-parse", "HEAD")
const dirtyFiles = git("status", "--porcelain=v1")
const remotes = git("remote")

if (!branch) {
  throw new Error("release-context: detached HEAD；请先切到明确分支")
}

if (branch !== control.candidateBranch) {
  throw new Error(
    `release-context: 当前分支 ${branch} 不是唯一候选分支 ${control.candidateBranch}`,
  )
}

git("merge-base", "--is-ancestor", control.integrationBase.commit, "HEAD")

console.log(`release-context-ok status=${control.status}`)
console.log(`candidate=${branch}`)
console.log(`head=${head}`)
console.log(`target=${control.targetBranch}`)
console.log(`workingTree=${dirtyFiles ? "dirty" : "clean"}`)
console.log(`remoteBackup=${remotes ? "configured" : "missing"}`)

if (dirtyFiles) {
  console.warn("warning: 工作区有未提交改动；进入发布门禁前必须清理或提交")
}
if (!remotes) {
  console.warn("warning: 尚未配置远程备份；不得把本地提交视为已安全发布")
}
