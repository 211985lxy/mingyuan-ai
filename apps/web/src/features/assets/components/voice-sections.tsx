import type { RefObject } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicVoice, UserVoice } from "@/features/assets/asset-page-shared";

export function VoiceSections({
  publicVoices,
  userVoices,
  playingVoiceId,
  publicVoicesScrollRef,
  onPreview,
}: {
  publicVoices: PublicVoice[];
  userVoices: UserVoice[];
  playingVoiceId: string | null;
  publicVoicesScrollRef: RefObject<HTMLDivElement | null>;
  onPreview: (voice: { id: string; demoUrl?: string }) => void;
}) {
  return (
    <>
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">我的声音</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              数字人克隆生成的专属声音资产，会默认复用到你的数字人上
            </p>
          </div>
        </div>

        {userVoices.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <Volume2 className="h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">还没有专属声音</p>
              <p className="text-sm text-muted-foreground mt-1">
                创建数字人后，系统会把克隆出的声音自动沉淀到这里
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {userVoices.map((voice) => {
              const isPlaying = playingVoiceId === voice.id;
              const hasDemo =
                !!voice.demoUrl &&
                voice.demoUrl !== "#" &&
                voice.demoUrl !== "";
              const status = voice.status ?? "ready";
              const statusLabel =
                status === "ready"
                  ? "可复用"
                  : status === "processing"
                    ? "克隆中"
                    : "失败";

              return (
                <Card
                  key={voice.assetId ?? voice.id}
                  onClick={() => {
                    if (hasDemo && status === "ready") {
                      onPreview(voice);
                    }
                  }}
                  className={`transition-colors duration-200 ${
                    hasDemo && status === "ready"
                      ? "hover:bg-muted/50 cursor-pointer"
                      : "cursor-default"
                  } ${isPlaying ? "ring-2 ring-primary bg-primary/5" : ""}`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 ${
                          isPlaying
                            ? "bg-primary text-primary-foreground"
                            : "bg-primary/10"
                        }`}
                      >
                        {isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <Badge
                        variant={
                          status === "ready"
                            ? "secondary"
                            : status === "failed"
                              ? "destructive"
                              : "outline"
                        }
                        className="shrink-0"
                      >
                        {statusLabel}
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium truncate">
                        {voice.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {status === "ready"
                          ? hasDemo
                            ? "可试听，也会默认用于对应数字人"
                            : "已可复用，会默认用于对应数字人"
                          : status === "processing"
                            ? "声音资源生成中，完成后会自动可用"
                            : voice.errorMessage || "声音生成失败，请重新克隆"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">公共声音</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              平台提供的声音素材，可在创建视频时选用
            </p>
          </div>
        </div>

        <div
          ref={publicVoicesScrollRef}
          className="flex gap-3 overflow-x-auto pb-2"
        >
          {publicVoices.map((voice) => {
            const isPlaying = playingVoiceId === voice.id;
            const hasDemo =
              !!voice.demoUrl && voice.demoUrl !== "#" && voice.demoUrl !== "";
            return (
              <Card
                key={voice.id}
                onClick={() => onPreview(voice)}
                className={`min-w-[160px] max-w-[180px] shrink-0 overflow-hidden transition-colors duration-200 ${
                  hasDemo
                    ? "hover:bg-muted/50 cursor-pointer"
                    : "opacity-60 cursor-default"
                } ${isPlaying ? "ring-2 ring-primary bg-primary/5" : ""}`}
              >
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 ${
                        isPlaying
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/10"
                      }`}
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    {hasDemo && (
                      <Badge
                        variant={isPlaying ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0 h-5"
                      >
                        {isPlaying ? "播放中" : "试听"}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium truncate">{voice.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {voice.gender || "通用"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}
