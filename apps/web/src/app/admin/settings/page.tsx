"use client";

import React from "react";
import { Plus, Loader2, Check, Pencil } from "lucide-react";
import { toast } from "sonner";

import { useBrandingControls } from "@/components/providers/branding-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  getAdminSettings,
  updateAdminSetting,
  createAdminSetting,
  type SettingItem,
  AdminApiError,
} from "@/lib/api/admin-client";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { BRANDING_SETTING_KEYS } from "@/lib/branding-config";

export default function AdminSettingsPage() {
  const [grouped, setGrouped] = React.useState<Record<string, SettingItem[]>>(
    {},
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const updateBranding = useBrandingControls();

  const fetchSettings = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminSettings();
      setGrouped(res.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "设置加载失败";
      setError(msg);
      toast.error(msg);
      setGrouped({});
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const categories = Object.keys(grouped);

  function handleSettingUpdated(key: string, newValue: string) {
    setGrouped((prev) => {
      const next = { ...prev };
      for (const cat of Object.keys(next)) {
        next[cat] = next[cat].map((s) =>
          s.key === key ? { ...s, value: newValue } : s,
        );
      }
      return next;
    });

    if (key === BRANDING_SETTING_KEYS.name) updateBranding({ name: newValue });
    if (key === BRANDING_SETTING_KEYS.logoUrl)
      updateBranding({ logoUrl: newValue });
    if (key === BRANDING_SETTING_KEYS.defaultName)
      updateBranding({ defaultName: newValue });
    if (key === BRANDING_SETTING_KEYS.defaultLogoUrl)
      updateBranding({ defaultLogoUrl: newValue });
  }

  return (
    <AdminPageShell
      title="系统设置"
      subtitle="管理应用配置项"
      actions={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer">
              <Plus className="h-4 w-4 mr-2" />
              添加设置
            </Button>
          </DialogTrigger>
          <DialogContent>
            <AddSettingForm
              onSuccess={() => {
                setDialogOpen(false);
                fetchSettings();
              }}
            />
          </DialogContent>
        </Dialog>
      }
      loading={loading}
      error={error}
      onRetry={fetchSettings}
      skeletonRows={3}
      empty={!loading && !error && categories.length === 0}
      emptyMessage="暂无设置项。点击「添加设置」创建一个。"
    >
      <Tabs defaultValue={categories[0]}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="w-max min-w-full">
            {categories.map((cat) => (
              <TabsTrigger
                key={cat}
                value={cat}
                className="capitalize cursor-pointer"
              >
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {categories.map((cat) => (
          <TabsContent key={cat} value={cat} className="space-y-3 mt-4">
            {grouped[cat].map((setting) => (
              <SettingRow
                key={setting.key}
                setting={setting}
                onUpdated={handleSettingUpdated}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </AdminPageShell>
  );
}

function SettingRow({
  setting,
  onUpdated,
}: {
  setting: SettingItem;
  onUpdated: (key: string, value: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(setting.value);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    setValue(setting.value);
  }, [setting.value]);
  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      await updateAdminSetting(setting.key, value);
      onUpdated(setting.key, value);
      setEditing(false);
      toast.success("已保存");
    } catch (e) {
      const m = e instanceof AdminApiError ? e.message : "保存失败";
      setErr(m);
      toast.error(m);
    } finally {
      setSaving(false);
    }
  }
  function handleToggle() {
    const nv = setting.value === "true" ? "false" : "true";
    setValue(nv);
    setSaving(true);
    updateAdminSetting(setting.key, nv)
      .then(() => {
        onUpdated(setting.key, nv);
        toast.success("已切换");
      })
      .catch(() => {
        setValue(setting.value);
      })
      .finally(() => setSaving(false));
  }
  return (
    <Card>
      <CardContent className="flex items-start gap-4 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-mono text-sm font-medium break-all">
              {setting.key}
            </span>
            <Badge variant="outline" className="text-xs">
              {setting.type}
            </Badge>
          </div>
          {setting.description && (
            <p className="text-xs text-muted-foreground mb-1">
              {setting.description}
            </p>
          )}
          {editing ? (
            <div className="space-y-2">
              {setting.type === "json" ? (
                <Textarea
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
              ) : (
                <Input
                  type={setting.type === "number" ? "number" : "text"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  保存
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setValue(setting.value);
                    setErr(null);
                  }}
                >
                  取消
                </Button>
              </div>
              {err && <p className="text-xs text-destructive">{err}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {setting.type === "boolean" ? (
                <Button
                  variant={setting.value === "true" ? "default" : "outline"}
                  size="sm"
                  onClick={handleToggle}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : setting.value === "true" ? (
                    "已启用"
                  ) : (
                    "已禁用"
                  )}
                </Button>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded break-all">
                    {setting.value}
                  </span>
                  {setting.key.includes("logo-url") && setting.value && (
                    <img
                      src={setting.value}
                      alt="preview"
                      className="h-10 w-10 rounded-md border object-contain p-1"
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {setting.type !== "boolean" && !editing && (
          <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AddSettingForm({ onSuccess }: { onSuccess: () => void }) {
  const [key, setKey] = React.useState("");
  const [value, setValue] = React.useState("");
  const [type, setType] = React.useState("string");
  const [category, setCategory] = React.useState("general");
  const [description, setDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      await createAdminSetting({
        key,
        value,
        type,
        category,
        description: description || undefined,
      });
      onSuccess();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>添加设置</DialogTitle>
        <DialogDescription>创建新的系统配置项。</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>键名</Label>
          <Input
            placeholder="max-upload-size"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>类型</Label>
            <Select value={type} onValueChange={(v) => setType(v ?? "string")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>分类</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v ?? "general")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="branding">Branding</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="plans">Plans</SelectItem>
                <SelectItem value="features">Features</SelectItem>
                <SelectItem value="limits">Limits</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>值</Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div>
          <Label>描述</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        <Button type="submit" disabled={loading || !key} className="w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}创建设置
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </>
  );
}
