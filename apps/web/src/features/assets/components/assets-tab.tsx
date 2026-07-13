import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AssetGrid } from "@/features/assets/components/asset-grid";
import { AssetUploadDialog } from "@/features/assets/components/asset-upload-dialog";
import { AssetsSkeleton } from "@/features/assets/components/page-sections";
import { VoiceSections } from "@/features/assets/components/voice-sections";
import {
  assetFilters,
  type AssetFilter,
  type PublicVoice,
  type UserVoice,
} from "@/features/assets/asset-page-shared";
import type { ApiAsset } from "@/types/api";

export function AssetsTab({
  assets,
  loading,
  onRefresh,
  publicVoices,
  userVoices,
}: {
  assets: ApiAsset[];
  loading: boolean;
  onRefresh: () => void;
  publicVoices: PublicVoice[];
  userVoices: UserVoice[];
}) {
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const publicVoicesScrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nonVoiceAssets = assets.filter((asset) => asset.assetType !== "voice");

  function handleVoicePreview(voice: { id: string; demoUrl?: string }) {
    if (!voice.demoUrl || voice.demoUrl === "#" || voice.demoUrl === "") return;

    if (playingVoiceId === voice.id) {
      audioRef.current?.pause();
      setPlayingVoiceId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    const audio = new Audio(voice.demoUrl);
    audioRef.current = audio;
    setPlayingVoiceId(voice.id);

    audio.play().catch(() => setPlayingVoiceId(null));
    audio.addEventListener("ended", () => setPlayingVoiceId(null));
    audio.addEventListener("error", () => setPlayingVoiceId(null));
  }

  useEffect(() => {
    return () => audioRef.current?.pause();
  }, []);

  useEffect(() => {
    const element = publicVoicesScrollRef.current;
    if (!element) return;
    function onWheel(event: WheelEvent) {
      if (element!.scrollWidth <= element!.clientWidth) return;
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (delta === 0) return;
      event.preventDefault();
      element!.scrollLeft += delta;
    }
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  if (loading) return <AssetsSkeleton />;

  return (
    <div className="space-y-10">
      <VoiceSections
        publicVoices={publicVoices}
        userVoices={userVoices}
        playingVoiceId={playingVoiceId}
        publicVoicesScrollRef={publicVoicesScrollRef}
        onPreview={handleVoicePreview}
      />

      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {assetFilters.map((item) => (
              <Button
                key={item.value}
                variant={filter === item.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(item.value)}
                className="cursor-pointer transition-colors duration-200"
              >
                {item.label}
              </Button>
            ))}
          </div>
          <AssetUploadDialog onUploaded={onRefresh} />
        </div>

        <AssetGrid assets={nonVoiceAssets} filter={filter} />
      </section>
    </div>
  );
}
