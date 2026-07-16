import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { PLATFORM_LABELS } from "@/features/benchmark-profiles/model"

export function ProfileBasicForm({ name, platform, accountUrl, followerCount, positioning, differentiator, takeaways, notes, onNameChange, onPlatformChange, onAccountUrlChange, onFollowerCountChange, onPositioningChange, onDifferentiatorChange, onTakeawaysChange, onNotesChange }: { name: string; platform: string; accountUrl: string; followerCount: string; positioning: string; differentiator: string; takeaways: string; notes: string; onNameChange: (value: string) => void; onPlatformChange: (value: string) => void; onAccountUrlChange: (value: string) => void; onFollowerCountChange: (value: string) => void; onPositioningChange: (value: string) => void; onDifferentiatorChange: (value: string) => void; onTakeawaysChange: (value: string) => void; onNotesChange: (value: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>基础信息</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>账号名称 / IP 名称 *</Label><Input value={name} onChange={(event) => onNameChange(event.target.value)} /></div>
          <div className="space-y-2"><Label>平台</Label><Select value={platform} onValueChange={(value) => { if (value) onPlatformChange(value) }}><SelectTrigger className="h-10"><SelectValue placeholder="选择平台（可选）" /></SelectTrigger><SelectContent>{Object.entries(PLATFORM_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>主页链接</Label><Input value={accountUrl} onChange={(event) => onAccountUrlChange(event.target.value)} placeholder="https://..." /></div>
          <div className="space-y-2"><Label>粉丝数</Label><Input type="number" value={followerCount} onChange={(event) => onFollowerCountChange(event.target.value)} placeholder="如：120000" /></div>
        </div>
        {platform ? <div className="space-y-4 border-t pt-2"><div className="space-y-2"><Label>内容定位</Label><Textarea rows={2} value={positioning} onChange={(event) => onPositioningChange(event.target.value)} placeholder="该账号的核心内容方向..." /></div><div className="space-y-2"><Label>差异化</Label><Textarea rows={2} value={differentiator} onChange={(event) => onDifferentiatorChange(event.target.value)} placeholder="相比同类账号的独特之处..." /></div><div className="space-y-2"><Label>借鉴要点</Label><Textarea rows={2} value={takeaways} onChange={(event) => onTakeawaysChange(event.target.value)} placeholder="迁移给本 IP 时怎么用..." /></div></div> : null}
        <div className="space-y-2 border-t pt-2"><Label>备注（可选）</Label><Input value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="内部备注..." /></div>
      </CardContent>
    </Card>
  )
}
