"use client"

import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"

type AdminFetch = (input: string, init?: RequestInit) => Promise<Response>

const ADMIN_FETCH: AdminFetch = (input, init) =>
  fetch(input, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } })

/** 技能编辑 Dialog：新建 / 编辑 / 删除自定义 skill。
 *  仅自定义 skill 可编辑删除；内置 skill 只读。 */
type SkillForm = {
  skillId: string
  label: string
  description: string
  prompt: string
  group: string
}
const EMPTY_FORM: SkillForm = { skillId: "", label: "", description: "", prompt: "", group: "" }
type SkillDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  skill: AimWorkbenchSkill | null
  agentId: string
  onSaved: () => void
  onDeleted: () => void
}

function useSkillForm(open: boolean, skill: AimWorkbenchSkill | null) {
  const [form, setForm] = useState<SkillForm>(EMPTY_FORM)
  const [error, setError] = useState("")
  useEffect(() => {
    if (open) {
      setError("")
      setForm(skill ? { skillId: skill.id, label: skill.label, description: skill.description, prompt: skill.prompt, group: skill.group ?? "" } : EMPTY_FORM)
    }
  }, [open, skill])
  return { form, setForm, error, setError }
}

function validateSkillForm(form: SkillForm, setError: (e: string) => void) {
  if (!form.skillId.trim()) { setError("技能 ID 必填"); return false }
  if (!form.label.trim()) { setError("技能名称必填"); return false }
  if (!form.prompt.trim()) { setError("提示词必填"); return false }
  return true
}

async function saveSkill(form: SkillForm, isEdit: boolean, skill: AimWorkbenchSkill | null, agentId: string) {
  const url = isEdit && skill?.isCustom ? `/api/admin/aim/skills/${encodeURIComponent(skill.id)}` : "/api/admin/aim/skills"
  const method = isEdit && skill?.isCustom ? "PATCH" : "POST"
  const body = isEdit ? form : { ...form, agentId }
  const errKey = isEdit ? "保存失败" : "新建失败"
  const res = await ADMIN_FETCH(url, { method, body: JSON.stringify(body) })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j.error ?? errKey)
  }
}

async function deleteSkill(skill: AimWorkbenchSkill | null) {
  if (!skill?.isCustom) return
  if (!confirm(`确认删除技能「${skill.label}」？`)) return
  const res = await ADMIN_FETCH(`/api/admin/aim/skills/${encodeURIComponent(skill.id)}`, { method: "DELETE" })
  if (!res.ok) throw new Error("删除失败")
}

function SkillFormFields(props: {
  form: SkillForm
  setForm: (f: SkillForm) => void
  isEdit: boolean
  error: string
}) {
  const { form, setForm, isEdit, error } = props
  const patch = (p: Partial<SkillForm>) => setForm({ ...form, ...p })
  return (
    <div className="space-y-3 py-2">
      <Field label="技能 ID" hint="唯一标识，与内置同名会覆盖内置">
        <Input value={form.skillId} onChange={(e) => patch({ skillId: e.target.value })} placeholder="如 my_custom_skill" disabled={isEdit} />
      </Field>
      <Field label="技能名称" hint="显示在技能卡片上的标题">
        <Input value={form.label} onChange={(e) => patch({ label: e.target.value })} placeholder="如 我要搞流量" />
      </Field>
      <Field label="一句话描述" hint="显示在标题下方">
        <Input value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="这个技能做什么" />
      </Field>
      <Field label="分组" hint="可选，用于 UI 分组">
        <Input value={form.group} onChange={(e) => patch({ group: e.target.value })} placeholder="如 内容目的" />
      </Field>
      <Field label="提示词" hint="注入给模型的专家指令">
        <textarea value={form.prompt} onChange={(e) => patch({ prompt: e.target.value })} placeholder="写给模型的指令…" rows={8}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </Field>
      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
    </div>
  )
}

function SkillDialogFooter(props: {
  isEdit: boolean
  saving: boolean
  onDelete: () => void
  onCancel: () => void
  onSave: () => void
}) {
  const { isEdit, saving, onDelete, onCancel, onSave } = props
  return (
    <DialogFooter className="gap-2">
      {isEdit ? (
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={saving}><Trash2 className="mr-1 size-3.5" /> 删除</Button>
      ) : null}
      <div className="flex-1" />
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>取消</Button>
      <Button size="sm" onClick={onSave} disabled={saving}>{saving ? "保存中…" : isEdit ? "保存" : "新建"}</Button>
    </DialogFooter>
  )
}

export function AimSkillEditDialog(props: SkillDialogProps) {
  const { open, onOpenChange, skill, agentId, onSaved, onDeleted } = props
  const isEdit = Boolean(skill?.isCustom)
  const [saving, setSaving] = useState(false)
  const { form, setForm, error, setError } = useSkillForm(open, skill)

  async function handleSave() {
    setError("")
    if (!validateSkillForm(form, setError)) return
    setSaving(true)
    try { await saveSkill(form, isEdit, skill, agentId); onSaved(); onOpenChange(false) }
    catch (err) { setError(err instanceof Error ? err.message : "操作失败") }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setSaving(true)
    try { await deleteSkill(skill); onDeleted(); onOpenChange(false) }
    catch (err) { setError(err instanceof Error ? err.message : "删除失败") }
    finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-[560px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑技能" : "新建技能"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "修改自定义技能的提示词或名称" : "新建一个自定义技能，运行时会与内置技能合并"}
          </DialogDescription>
        </DialogHeader>
        <SkillFormFields form={form} setForm={setForm} isEdit={isEdit} error={error} />
        <SkillDialogFooter isEdit={isEdit} saving={saving} onDelete={handleDelete} onCancel={() => onOpenChange(false)} onSave={handleSave} />
      </DialogContent>
    </Dialog>
  )
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-medium text-foreground">{props.label}</label>
      {props.children}
      {props.hint ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground/70">{props.hint}</p>
      ) : null}
    </div>
  )
}
