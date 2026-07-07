"use client";

import React from "react";
import {
  KeyRound,
  Download,
  Plus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getActivationCodes,
  getActivationCodeStats,
  downloadActivationCodesExport,
  generateActivationCodes,
  type ActivationCodeItem,
  type CodeStats,
  AdminApiError,
} from "@/lib/api/admin-client";

function formatCode(code: string): string {
  return code.replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

export default function AdminActivationCodesPage() {
  const [codes, setCodes] = React.useState<ActivationCodeItem[]>([]);
  const [stats, setStats] = React.useState<CodeStats | null>(null);
  const [batches, setBatches] = React.useState<string[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [batchFilter, setBatchFilter] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const pageSize = 20;

  const fetchCodes = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getActivationCodes({
        page,
        pageSize,
        status: statusFilter,
        batchId: batchFilter,
      });
      setCodes(res.data.results);
      setTotal(res.data.total);
      setBatches(res.data.batches);
    } catch (error) {
      console.error(error);
      setCodes([]);
      setTotal(0);
      setBatches([]);
      toast.error(error instanceof Error ? error.message : "激活码列表加载失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, batchFilter]);

  const fetchStats = React.useCallback(async () => {
    try {
      const res = await getActivationCodeStats();
      setStats(res.data);
    } catch (error) {
      console.error(error);
      setStats(null);
      toast.error(error instanceof Error ? error.message : "激活码统计加载失败");
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCodes();
  }, [fetchCodes]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
  }, [fetchStats]);

  const totalPages = Math.ceil(total / pageSize);

  async function handleExport() {
    try {
      const { blob, fileName } = await downloadActivationCodesExport({
        status: statusFilter,
        batchId: batchFilter,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("导出成功");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "导出失败，请重试");
    }
  }

  function handleGenerated() {
    setDialogOpen(false);
    setPage(1);
    fetchCodes();
    fetchStats();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">激活码管理</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer">
              <Plus className="h-4 w-4 mr-2" />
              生成激活码
            </Button>
          </DialogTrigger>
          <DialogContent>
            <GenerateCodesForm onSuccess={handleGenerated} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="总数"
          value={stats?.total}
          icon={<KeyRound className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="未使用"
          value={stats?.unused}
          icon={<Circle className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="已使用"
          value={stats?.used}
          icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="使用率"
          value={stats ? `${stats.usageRate}%` : undefined}
          icon={<KeyRound className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => {
            const nextValue = v ?? "all";
            setStatusFilter(nextValue === "all" ? "" : nextValue);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="unused">未使用</SelectItem>
            <SelectItem value="used">已使用</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={batchFilter || "all"}
          onValueChange={(v) => {
            const nextValue = v ?? "all";
            setBatchFilter(nextValue === "all" ? "" : nextValue);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="全部批次" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部批次</SelectItem>
            {batches.map((b) => (
              <SelectItem key={b} value={b}>
                {b.slice(0, 8)}...
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="hidden sm:block flex-1" />

        <Button
          variant="outline"
          onClick={handleExport}
          className="cursor-pointer"
        >
          <Download className="h-4 w-4 mr-2" />
          导出 CSV
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">激活码</th>
                  <th className="text-left p-3 font-medium">状态</th>
                  <th className="text-left p-3 font-medium">有效期</th>
                  <th className="text-left p-3 font-medium">批次备注</th>
                  <th className="text-left p-3 font-medium">使用者</th>
                  <th className="text-left p-3 font-medium">使用时间</th>
                  <th className="text-left p-3 font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="p-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : codes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-muted-foreground"
                    >
                      未找到激活码
                    </td>
                  </tr>
                ) : (
                  codes.map((code) => (
                    <tr
                      key={code.id}
                      className="border-b hover:bg-muted/30 transition-colors duration-150"
                    >
                      <td className="p-3 font-mono text-sm whitespace-nowrap">
                        {formatCode(code.code)}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            code.status === "used" ? "default" : "secondary"
                          }
                        >
                          {code.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {code.durationDays} 天
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {code.batchNote || "-"}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {code.user?.email || "-"}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {code.usedAt
                          ? new Date(code.usedAt).toLocaleString("zh-CN")
                          : "-"}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(code.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            显示 {(page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, total)}，共 {total} 条
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number | string | undefined;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {value !== undefined ? (
          <p className="text-2xl font-bold">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
        ) : (
          <Skeleton className="h-8 w-16" />
        )}
      </CardContent>
    </Card>
  );
}

function GenerateCodesForm({ onSuccess }: { onSuccess: () => void }) {
  const [quantity, setQuantity] = React.useState("50");
  const [durationDays, setDurationDays] = React.useState("14");
  const [batchNote, setBatchNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ count: number; durationDays: number } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity);
    const duration = parseInt(durationDays);
    if (!qty || qty < 1 || qty > 500) {
      setError("数量必须在 1 到 500 之间");
      return;
    }
    if (!duration || duration < 1 || duration > 3650) {
      setError("有效天数必须在 1 到 3650 之间");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await generateActivationCodes(qty, duration, batchNote || undefined);
      setResult({ count: res.data.count, durationDays: res.data.durationDays });
      toast.success(`已生成 ${res.data.count} 个激活码`);
      setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.message : "生成失败，请重试";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="text-center py-6">
        <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
        <p className="text-lg font-medium">
          已成功生成 {result.count} 个激活码
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          每个激活码可激活 {result.durationDays} 天服务。
        </p>
      </div>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>生成激活码</DialogTitle>
        <DialogDescription>
          批量生成激活码，设定每码激活后提供的服务天数。
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gen-quantity">数量 (1-500)</Label>
          <Input
            id="gen-quantity"
            type="number"
            min={1}
            max={500}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gen-duration">有效天数 (1-3650)</Label>
          <Input
            id="gen-duration"
            type="number"
            min={1}
            max={3650}
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gen-note">批次备注（可选）</Label>
          <Textarea
            id="gen-note"
            placeholder="例如：三月活动、合作伙伴X"
            value={batchNote}
            onChange={(e) => setBatchNote(e.target.value)}
            rows={2}
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="w-full cursor-pointer"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          生成
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </>
  );
}
