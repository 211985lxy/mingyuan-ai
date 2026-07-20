import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PLATFORM_LABELS, type ImportableAnalysis } from "@/features/benchmark-profiles/model"

/**
 * @description profiledetaildialogs
 * @param options - 配置选项
 * @returns 无返回值
 */
export function ProfileDetailDialogs({ archiveOpen, archiving, importOpen, importLoading, importing, analyses, selectedAnalysisId, importError, onArchiveOpenChange, onArchive, onImportOpenChange, onAnalysisChange, onImport }: { archiveOpen: boolean; archiving: boolean; importOpen: boolean; importLoading: boolean; importing: boolean; analyses: ImportableAnalysis[]; selectedAnalysisId: string; importError: string | null; onArchiveOpenChange: (open: boolean) => void; onArchive: () => void; onImportOpenChange: (open: boolean) => void; onAnalysisChange: (id: string) => void; onImport: () => void }) {
  return (
    <>
      <Dialog open={archiveOpen} onOpenChange={onArchiveOpenChange}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>确认归档</DialogTitle><DialogDescription>归档后，该档案及其所有素材将从 AIM 检索中移除。你可以随时在「已归档」列表中恢复。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => onArchiveOpenChange(false)} disabled={archiving}>取消</Button><Button variant="destructive" onClick={onArchive} disabled={archiving}>{archiving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />归档中</> : "确认归档"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={importOpen} onOpenChange={onImportOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>一键拉取竞品分析</DialogTitle><DialogDescription>选择一个已完成的竞品分析，导入账号诊断和爆款样本到当前档案。</DialogDescription></DialogHeader><div className="space-y-3">{importLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : analyses.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">暂无可导入的竞品分析记录</p> : <Select value={selectedAnalysisId} onValueChange={(value) => { if (value) onAnalysisChange(value) }}><SelectTrigger className="h-10"><SelectValue placeholder="选择竞品分析..." /></SelectTrigger><SelectContent>{analyses.map((analysis) => <SelectItem key={analysis.id} value={analysis.id}><div className="flex items-center gap-2"><span>{analysis.accountName || "未知账号"}</span>{analysis.platform && PLATFORM_LABELS[analysis.platform] ? <Badge variant="outline" className="ml-1 text-[10px]">{PLATFORM_LABELS[analysis.platform]}</Badge> : null}{analysis.overallScore != null ? <span className="text-xs text-muted-foreground">{analysis.overallScore}分</span> : null}{analysis.user ? <span className="text-xs text-muted-foreground">({analysis.user.email ?? analysis.user.name})</span> : null}</div></SelectItem>)}</SelectContent></Select>}{importError ? <p className="text-sm text-destructive">{importError}</p> : null}</div><DialogFooter><Button variant="outline" onClick={() => onImportOpenChange(false)} disabled={importing}>取消</Button><Button onClick={onImport} disabled={importing || !selectedAnalysisId}>{importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />导入中</> : "导入"}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
