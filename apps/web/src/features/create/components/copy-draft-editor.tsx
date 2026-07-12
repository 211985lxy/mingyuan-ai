"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Flame, Loader2, Wand2 } from "lucide-react";
import { checkScriptQuality, polishScript, type QualityCheckReport } from "@/lib/api/client";
import { QualityReportCard } from "@/components/quality-report";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ApiScript, ApiTopicCard } from "@/types/api";

interface CopyDraftEditorProps {
  selectedTopicCard: ApiTopicCard | null;
  generatedScripts: ApiScript[];
  selectedScriptId: string | null;
  onSelectScript: (id: string) => void;
  editedScript: string;
  onEditScript: (value: string) => void;
  isDegraded: boolean;
  hotTopicTitle?: string | null;
  persona?: string;
  onNext: () => void;
  onBack: () => void;
}

export function CopyDraftEditor({
  selectedTopicCard,
  generatedScripts,
  selectedScriptId,
  onSelectScript,
  editedScript,
  onEditScript,
  isDegraded,
  hotTopicTitle,
  persona,
  onNext,
  onBack,
}: CopyDraftEditorProps) {
  // Quality check state
  const [qualityReport, setQualityReport] = useState<QualityCheckReport | null>(null);
  const [isCheckingQuality, setIsCheckingQuality] = useState(false);
  const [qualityCheckError, setQualityCheckError] = useState<string | null>(null);
  const [isPolishing, setIsPolishing] = useState(false);
  const [autoChecked, setAutoChecked] = useState(false);
  const autoCheckTriggeredRef = useRef<string | null>(null);

  // Auto-run quality check when a script is first selected
  useEffect(() => {
    if (selectedScriptId && editedScript.trim() && selectedScriptId !== autoCheckTriggeredRef.current) {
      autoCheckTriggeredRef.current = selectedScriptId;
      setAutoChecked(true);
      setQualityReport(null);
      setQualityCheckError(null);
      setIsCheckingQuality(true);
      checkScriptQuality({
        content: editedScript.trim(),
        topicTitle: selectedTopicCard?.title,
        persona: persona,
      })
        .then(setQualityReport)
        .catch((error) => {
          setQualityCheckError(
            error instanceof Error ? error.message : "自动质量检查失败，请手动重试"
          );
        })
        .finally(() => setIsCheckingQuality(false));
    }
  }, [selectedScriptId, editedScript, selectedTopicCard?.title, persona]);

  function handleEditedScriptInput(nextValue: string) {
    onEditScript(nextValue);
    setQualityReport(null);
    setQualityCheckError(null);
    setAutoChecked(false);
  }

  async function handleQualityCheck() {
    if (!editedScript.trim()) {
      setQualityCheckError("请先输入文案内容");
      return;
    }

    setIsCheckingQuality(true);
    setQualityCheckError(null);
    setQualityReport(null);

    try {
      const report = await checkScriptQuality({
        content: editedScript.trim(),
        topicTitle: selectedTopicCard?.title,
        persona: persona,
      });
      setQualityReport(report);
    } catch (error) {
      setQualityCheckError(
        error instanceof Error ? error.message : "质量检查失败，请稍后重试"
      );
    } finally {
      setIsCheckingQuality(false);
    }
  }

  async function handlePolish() {
    if (!editedScript.trim()) return;

    // Determine weak dimensions from quality report
    const weakDimensions: string[] = [];
    if (qualityReport) {
      if (!qualityReport.aiTaste.passed) weakDimensions.push("aiTaste");
      if (!qualityReport.editorial.passed) weakDimensions.push("editorial");
      if (!qualityReport.attraction.passed) weakDimensions.push("attraction");
      if (!qualityReport.logic.passed) weakDimensions.push("logic");
    }

    setIsPolishing(true);
    try {
      const result = await polishScript({
        content: editedScript.trim(),
        weakDimensions,
        topicTitle: selectedTopicCard?.title,
        persona: persona,
      });
      onEditScript(result.polished);
      toast.success("AI 润色完成，请查看修改后的文案");
      setQualityReport(null);
      setQualityCheckError(null);
      setAutoChecked(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 润色失败，请重试");
    } finally {
      setIsPolishing(false);
    }
  }

  return (
    <>
      {/* Generated scripts */}
      {generatedScripts.length > 0 && (
        <div className="space-y-4">
          <Separator />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              AI 生成了 {generatedScripts.length} 条文案，请选择一条：
            </h3>
            {isDegraded && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                <AlertTriangle className="h-3 w-3 mr-1" />质量偏低，建议优化选题后重新生成
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3">
            {generatedScripts.map((script, index) => {
              const isSelected = selectedScriptId === script.id;
              const score = script.qualityScore;
              return (
                <Card
                  key={script.id}
                  className={`cursor-pointer transition-colors duration-200 hover:border-primary/50 ${
                    isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : ""
                  }`}
                  onClick={() => onSelectScript(script.id)}
                >
                  <CardContent>
                    <div className="flex items-start gap-3">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm leading-relaxed">{script.content}</p>
                        {score != null && (
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant={score >= 70 ? "default" : score >= 50 ? "secondary" : "outline"} className="text-xs">
                              质量分：{Math.round(score)}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-1 text-primary text-xs font-medium mt-2 ml-9">
                        <Check className="h-3.5 w-3.5" /> 已选择
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit script */}
      {selectedScriptId && (
        <div className="space-y-3">
          <Separator />
          <Card className="border-primary/20 bg-primary/[0.02]">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-primary" />
                    文案审核 & 热点融合
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    选择文案后自动检查四个维度；热点融合是可选项，可以从实时热点入口进入。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {hotTopicTitle ? (
                    <Badge variant="outline" className="border-orange-300 text-orange-600">
                      已结合热点：{hotTopicTitle}
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="cursor-pointer gap-1.5"
                      onClick={() => { window.location.href = "/home"; }}
                    >
                      <Flame className="h-3.5 w-3.5" />结合热点
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleQualityCheck}
                    disabled={isCheckingQuality || !editedScript.trim()}
                    className="cursor-pointer gap-1.5"
                  >
                    {isCheckingQuality ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" />检查中...</>
                    ) : (
                      <><Wand2 className="h-3.5 w-3.5" />质量检查</>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isCheckingQuality && (
                <div className="flex items-start gap-3 rounded-md border bg-background/70 p-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">正在执行四维质量检查</p>
                    <p className="text-xs text-muted-foreground mt-0.5">编辑质量、AI 味、吸引力、逻辑性会一起评估。</p>
                  </div>
                </div>
              )}

              {qualityCheckError && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="flex items-start gap-3 py-3">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm text-red-800 font-medium">质量检查失败</p>
                      <p className="text-xs text-red-600 mt-0.5">{qualityCheckError}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {qualityReport && (
                <QualityReportCard
                  report={qualityReport}
                  onPolish={handlePolish}
                  isPolishing={isPolishing}
                />
              )}

              {!qualityReport && !isCheckingQuality && !qualityCheckError && (
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-amber-800 font-medium">
                      {autoChecked ? "尚未完成质量检查" : "当前文案需要质量检查"}
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">建议先确认文案达标后再进入下一步，质量门控只提醒，不会阻止继续生成。</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-script" className="text-sm font-semibold text-muted-foreground">编辑文案（可修改）</Label>
            </div>
            <Textarea
              id="edit-script"
              value={editedScript}
              onChange={(e) => handleEditedScriptInput(e.target.value)}
              rows={5}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              约 {editedScript.length} 字，预估时长 {Math.ceil(editedScript.length / 3.5)} 秒
            </p>
          </div>

        </div>
      )}

      {!selectedScriptId && generatedScripts.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 py-3">
            <Wand2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">选择一条文案后会进入质量门控</p>
              <p className="text-xs text-muted-foreground mt-0.5">系统会自动执行四维质检，并在不通过时提供 AI 润色入口。</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spacer for sticky bottom bar */}
      <div className="h-20" />

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Button type="button" variant="outline" onClick={onBack} className="cursor-pointer">
            <ChevronLeft className="h-4 w-4 mr-1" /> 上一步
          </Button>
          {selectedScriptId && editedScript.trim() && (
            <div className="flex items-center gap-2">
              {qualityReport && !qualityReport.overall.passed && (
                <span className="text-xs text-amber-600">⚠ 质量未通过，建议先润色</span>
              )}
              {!qualityReport && !isCheckingQuality && (
                <span className="text-xs text-amber-600">⚠ 未质检</span>
              )}
              <Button type="button" onClick={onNext} className="cursor-pointer">
                下一步：定包装 <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </div>    </>
  );
}
