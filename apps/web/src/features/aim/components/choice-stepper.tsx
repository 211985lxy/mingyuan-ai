"use client"

import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ChoiceGroup } from "@/features/aim/aim-choice-groups"

export function ChoiceStepper({
  groups,
  busy,
  onSubmit,
}: {
  groups: ChoiceGroup[]
  busy: boolean
  onSubmit: (text: string) => void
}) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const group = groups[step]
  if (!group) return null

  const selected = answers[step]
  const isLast = step === groups.length - 1

  function next() {
    if (!selected) return
    if (!isLast) {
      setStep((current) => current + 1)
      return
    }
    onSubmit(groups.map((item, index) => `${index + 1}. ${item.question}\n${answers[index]}`).join("\n\n"))
  }

  return (
    <div className="mt-3 max-w-xl rounded-xl border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {step + 1}/{groups.length} · {group.question}
        </p>
        <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy || !selected} onClick={next}>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-2">
        {group.options.map((option) => {
          const value = `${option.label}. ${option.text}`
          return (
            <Button
              key={value}
              type="button"
              variant={selected === value ? "default" : "outline"}
              className="h-auto justify-start whitespace-normal px-3 py-2 text-left text-xs"
              disabled={busy}
              onClick={() => setAnswers((current) => ({ ...current, [step]: value }))}
            >
              <span className="mr-1 font-semibold">{option.label}</span>
              {option.text}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
