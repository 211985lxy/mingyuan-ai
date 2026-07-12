"use client";

import { Flame, Loader2, PenLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CopyDraftEditor } from "@/features/create/components/copy-draft-editor";
import { CopyStructureSelector } from "@/features/create/components/copy-structure-selector";
import type { ApiCopyStructure, ApiEndingType, ApiOpeningType, ApiScript, ApiTopicCard, IpProfileResponse } from "@/types/api";

export function PhaseCopywriting({
  selectedTopicCard,
  openingTypes,
  copyStructures,
  endingTypes,
  selectedOpeningCode,
  selectedCopyStructureCode,
  selectedEndingCode,
  onSelectOpening,
  onSelectCopyStructure,
  onSelectEnding,
  generatedScripts,
  selectedScriptId,
  onSelectScript,
  editedScript,
  onEditScript,
  isGenerating,
  isDegraded,
  onGenerate,
  ipProfile,
  hotTopicTitle,
  onNext,
  onBack,
}: {
  selectedTopicCard: ApiTopicCard | null;
  openingTypes: ApiOpeningType[];
  copyStructures: ApiCopyStructure[];
  endingTypes: ApiEndingType[];
  selectedOpeningCode: string | null;
  selectedCopyStructureCode: string | null;
  selectedEndingCode: string | null;
  onSelectOpening: (code: string) => void;
  onSelectCopyStructure: (code: string) => void;
  onSelectEnding: (code: string) => void;
  generatedScripts: ApiScript[];
  selectedScriptId: string | null;
  onSelectScript: (id: string) => void;
  editedScript: string;
  onEditScript: (v: string) => void;
  isGenerating: boolean;
  isDegraded: boolean;
  onGenerate: () => void;
  ipProfile: IpProfileResponse | null;
  hotTopicTitle?: string | null;
  onNext: () => void;
  onBack: () => void;
}) {
  const profile = ipProfile?.profile;
  const canGenerate =
    !isGenerating
    && !!selectedOpeningCode
    && !!selectedCopyStructureCode
    && !!selectedEndingCode
    && !!profile?.isComplete;

  return (
    <div className="space-y-5 sm:space-y-8">
      <div>
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <PenLine className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          内容生产官 · 生成与定稿
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
          这里是主流程核心：先选表达结构，再生成、质检、润色并锁定最终口播文案。
        </p>
      </div>

      <CopyStructureSelector
        selectedTopicCard={selectedTopicCard}
        openingTypes={openingTypes}
        copyStructures={copyStructures}
        endingTypes={endingTypes}
        selectedOpeningCode={selectedOpeningCode}
        selectedCopyStructureCode={selectedCopyStructureCode}
        selectedEndingCode={selectedEndingCode}
        onSelectOpening={onSelectOpening}
        onSelectCopyStructure={onSelectCopyStructure}
        onSelectEnding={onSelectEnding}
      />

      {/* IP Profile info */}
      <Separator />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium">IP 档案信息（自动读取）</CardTitle>
        </CardHeader>
        <CardContent>
          {profile ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {profile.displayName && (
                <div><span className="text-muted-foreground">IP 名称：</span><span className="font-medium">{profile.displayName}</span></div>
              )}
              {profile.industry && (
                <div><span className="text-muted-foreground">行业：</span><span className="font-medium">{profile.industry}</span></div>
              )}
              {profile.primaryOffer && (
                <div className="sm:col-span-2"><span className="text-muted-foreground">主打内容：</span><span className="font-medium">{profile.primaryOffer}</span></div>
              )}
              {profile.targetAudience && (
                <div className="sm:col-span-2"><span className="text-muted-foreground">目标受众：</span><span className="font-medium">{profile.targetAudience}</span></div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              未找到 IP 档案，请先前往
              <a href="/ip-profile" className="text-primary underline-offset-4 hover:underline ml-1">完善 IP 档案</a>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Generate scripts button */}
      <div className="flex flex-col items-center gap-2">
        {hotTopicTitle && (
          <div className="flex items-center gap-1.5 text-xs text-orange-600">
            <Flame className="h-3.5 w-3.5" />
            <span>热点「{hotTopicTitle}」将融入文案生成</span>
          </div>
        )}
        <Button size="lg" onClick={onGenerate} disabled={!canGenerate} className="cursor-pointer gap-2 px-8">
          {isGenerating ? (
            <><Loader2 className="h-4 w-4 animate-spin" />内容生产官创作中...</>
          ) : (
            <><Sparkles className="h-4 w-4" />{hotTopicTitle ? "热点融合写文案" : "启动内容生产官"}</>
          )}
        </Button>
      </div>

      <CopyDraftEditor
        selectedTopicCard={selectedTopicCard}
        generatedScripts={generatedScripts}
        selectedScriptId={selectedScriptId}
        onSelectScript={onSelectScript}
        editedScript={editedScript}
        onEditScript={onEditScript}
        isDegraded={isDegraded}
        hotTopicTitle={hotTopicTitle}
        persona={profile?.displayName ?? undefined}
        onNext={onNext}
        onBack={onBack}
      />

    </div>
  );
}
