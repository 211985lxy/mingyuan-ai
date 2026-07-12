"use client";

import { useState } from "react";
import { Check, ChevronDown, Clapperboard, FileText, PenLine, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getElementBadgeClass, getElementName } from "@/features/create/components/topic-phase";
import type { ApiCopyStructure, ApiEndingType, ApiOpeningType, ApiTopicCard } from "@/types/api";

interface CopyStructureSelectorProps {
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
}

export function CopyStructureSelector({
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
}: CopyStructureSelectorProps) {
  const [openSection1, setOpenSection1] = useState(false);
  const [openSection2, setOpenSection2] = useState(false);
  const [openSection3, setOpenSection3] = useState(false);
  const selectedOpening = openingTypes.find((item) => item.code === selectedOpeningCode);
  const selectedStructure = copyStructures.find((item) => item.code === selectedCopyStructureCode);
  const selectedEnding = endingTypes.find((item) => item.code === selectedEndingCode);

  return (
    <>
      {/* Selected topic summary */}
      {selectedTopicCard && (
        <Card className="bg-muted/30">
          <CardContent className="flex items-start gap-2 sm:gap-3">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <span className="text-xs sm:text-sm font-medium">{selectedTopicCard.title}</span>
              <div className="flex flex-wrap gap-1">
                {selectedTopicCard.elementCodes.map((code) => (
                  <Badge key={code} variant="outline" className={`text-[10px] sm:text-xs ${getElementBadgeClass(code)}`}>
                    {getElementName(code)}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/15 bg-primary/[0.02]">
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">自动整理脚本表达</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                系统会基于选题整理开头、正文和结尾；你也可以展开手动微调。
              </p>
            </div>
            <Badge variant="outline" className="shrink-0">可手动微调</Badge>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-xs text-muted-foreground">开头</p>
              <p className="text-sm font-medium mt-0.5">{selectedOpening?.name ?? "待匹配"}</p>
            </div>
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-xs text-muted-foreground">文案结构</p>
              <p className="text-sm font-medium mt-0.5">{selectedStructure?.name ?? "待匹配"}</p>
            </div>
            <div className="rounded-md border bg-background/70 p-2">
              <p className="text-xs text-muted-foreground">结尾</p>
              <p className="text-sm font-medium mt-0.5">{selectedEnding?.name ?? "待匹配"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 1: Opening Types */}
      <div className="space-y-3">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left cursor-pointer"
          onClick={() => setOpenSection1(!openSection1)}
        >
          <div>
            <h3 className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <PenLine className="h-4 w-4 text-primary" />
              开场类型
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">选择视频的开场方式</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openSection1 ? "rotate-180" : ""}`} />
        </button>
        {openSection1 && (
          openingTypes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {openingTypes.map((ot) => {
                const isSelected = selectedOpeningCode === ot.code;
                return (
                  <Card
                    key={ot.id}
                    className={`cursor-pointer transition-colors duration-200 hover:border-primary/50 ${
                      isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : ""
                    }`}
                    onClick={() => onSelectOpening(ot.code)}
                  >
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{ot.name}</CardTitle>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground leading-relaxed">{ot.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 flex-1 rounded-lg" />
              ))}
            </div>
          )
        )}
      </div>

      <Separator />

      {/* Section 2: Copy Structures */}
      <div className="space-y-3">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left cursor-pointer"
          onClick={() => setOpenSection2(!openSection2)}
        >
          <div>
            <h3 className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              文案结构
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">选择文案的叙事结构</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openSection2 ? "rotate-180" : ""}`} />
        </button>
        {openSection2 && (
          copyStructures.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {copyStructures.map((cs) => {
                const isSelected = selectedCopyStructureCode === cs.code;
                return (
                  <Card
                    key={cs.id}
                    className={`cursor-pointer transition-colors duration-200 hover:border-primary/50 ${
                      isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : ""
                    }`}
                    onClick={() => onSelectCopyStructure(cs.code)}
                  >
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{cs.name}</CardTitle>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-xs text-muted-foreground leading-relaxed">{cs.description}</p>
                      {cs.beats && cs.beats.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {cs.beats.map((beat) => (
                            <Badge key={beat.key} variant="secondary" className="text-[10px]">
                              {beat.label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 flex-1 rounded-lg" />
              ))}
            </div>
          )
        )}
      </div>

      <Separator />

      {/* Section 3: Ending Types */}
      <div className="space-y-3">
        <button
          type="button"
          className="flex items-center justify-between w-full text-left cursor-pointer"
          onClick={() => setOpenSection3(!openSection3)}
        >
          <div>
            <h3 className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <Clapperboard className="h-4 w-4 text-primary" />
              结尾类型
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">选择视频的结尾方式</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openSection3 ? "rotate-180" : ""}`} />
        </button>
        {openSection3 && (
          endingTypes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {endingTypes.map((et) => {
                const isSelected = selectedEndingCode === et.code;
                return (
                  <Card
                    key={et.id}
                    className={`cursor-pointer transition-colors duration-200 hover:border-primary/50 ${
                      isSelected ? "border-primary ring-2 ring-primary/20 bg-primary/[0.02]" : ""
                    }`}
                    onClick={() => onSelectEnding(et.code)}
                  >
                    <CardHeader className="pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{et.name}</CardTitle>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground leading-relaxed">{et.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 flex-1 rounded-lg" />
              ))}
            </div>
          )
        )}
      </div>

    </>
  );
}
