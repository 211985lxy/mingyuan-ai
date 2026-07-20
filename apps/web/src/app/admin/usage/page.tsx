"use client";
import React from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminPageShell } from "@/components/admin/admin-page-shell";

interface UsageRecord {
  id: string;
  userId: string | null;
  agentId: string | null;
  action: string;
  status: string;
  durationMs: number | null;
  model: string | null;
  totalTokens: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export default function AdminUsagePage() {
  const [records, setRecords] = React.useState<UsageRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const fetchRecords = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/agents/traces?limit=50");
      if (!res.ok) throw new Error(`请求失败 (${res.status})`);
      const json = await res.json();
      setRecords(json.data?.traces ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setError(msg);
      toast.error(msg);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);
  return (
    <AdminPageShell
      title="使用记录"
      subtitle="智能体 API 调用记录"
      error={error}
      onRetry={fetchRecords}
      loading={loading}
      skeletonRows={5}
      empty={!loading && !error && records.length === 0}
      emptyMessage="暂无使用记录"
    >
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 font-medium text-left">智能体</th>
                <th className="p-3 font-medium text-left">操作</th>
                <th className="p-3 font-medium text-left">状态</th>
                <th className="p-3 font-medium text-left">模型</th>
                <th className="p-3 font-medium text-right">耗时</th>
                <th className="p-3 font-medium text-right">Token</th>
                <th className="p-3 font-medium text-left">时间</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{r.agentId || "—"}</td>
                  <td className="p-3 text-muted-foreground">{r.action}</td>
                  <td className="p-3">
                    <Badge
                      variant={
                        r.status === "success" ? "default" : "destructive"
                      }
                      className="text-xs"
                    >
                      {r.status === "success" ? "成功" : "失败"}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {r.model || "—"}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">
                    {r.durationMs != null
                      ? `${(r.durationMs / 1000).toFixed(1)}s`
                      : "—"}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">
                    {r.totalTokens?.toLocaleString() ?? "—"}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("zh-CN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </AdminPageShell>
  );
}
