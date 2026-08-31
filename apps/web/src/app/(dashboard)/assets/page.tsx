"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AssetsTab } from "@/features/assets/components/assets-tab"
import { AvatarsTab } from "@/features/assets/components/avatars-tab"
import { AssetFlowOverview } from "@/features/assets/components/page-sections"
import { listAssets, listAvatars } from "@/lib/api/client"
import { listClientProjects, type ClientProject } from "@/lib/api/projects"
import type { ApiAsset, ApiAvatar } from "@/types/api"

export default function AssetsPage() {
  const [assets, setAssets] = useState<ApiAsset[]>([])
  const [avatars, setAvatars] = useState<ApiAvatar[]>([])
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [avatarsLoading, setAvatarsLoading] = useState(true)

  const fetchAssets = useCallback(async () => {
    setAssetsLoading(true)
    try {
      setAssets(await listAssets())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "素材加载失败，请重试")
      setAssets([])
    } finally {
      setAssetsLoading(false)
    }
  }, [])

  const fetchProjects = useCallback(async () => {
    try {
      const nextProjects = await listClientProjects("active")
      setProjects(nextProjects)
      setSelectedProjectId((current) =>
        nextProjects.some((project) => project.id === current)
          ? current
          : nextProjects[0]?.id ?? "",
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "项目加载失败，请重试")
      setProjects([])
      setSelectedProjectId("")
    }
  }, [])

  const fetchAvatars = useCallback(async (projectId: string) => {
    setAvatarsLoading(true)
    try {
      setAvatars(projectId ? await listAvatars(projectId) : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "数字人加载失败，请重试")
      setAvatars([])
    } finally {
      setAvatarsLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(fetchAssets)
    void Promise.resolve().then(fetchProjects)
  }, [fetchAssets, fetchProjects])

  useEffect(() => {
    void Promise.resolve().then(() => fetchAvatars(selectedProjectId))
  }, [fetchAvatars, selectedProjectId])

  const readyAvatarCount = avatars.filter((item) => item.status === "ready").length

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">AIM 资产库</h1>
          <Badge variant="outline" className="text-[10px] sm:text-xs">
            数字人 + 证据素材
          </Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          这里沉淀数字人分身和企业证据素材。数字人就绪后，可在作品编辑里直接生成口播视频。
        </p>
        <AssetFlowOverview
          assetCount={assets.length}
          readyAvatarCount={readyAvatarCount}
        />
      </div>

      <Tabs defaultValue="avatars" className="space-y-6">
        <TabsList>
          <TabsTrigger value="avatars">数字人（{avatars.length}）</TabsTrigger>
          <TabsTrigger value="assets">素材（{assets.length}）</TabsTrigger>
        </TabsList>
        <TabsContent value="avatars">
          <AvatarsTab
            avatars={avatars}
            loading={avatarsLoading}
            projects={projects}
            projectId={selectedProjectId}
            onProjectChange={setSelectedProjectId}
            onRefresh={() => fetchAvatars(selectedProjectId)}
          />
        </TabsContent>
        <TabsContent value="assets">
          <AssetsTab assets={assets} loading={assetsLoading} onRefresh={fetchAssets} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
