import { useRef, useState } from "react";
import { Loader2, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assetTypeConfig, type AssetType } from "@/features/assets/asset-page-shared";
import {
  uploadFileToStorage,
} from "@/lib/api/client";

/**
 * @description assetuploaddialog
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AssetUploadDialog({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("image");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setName("");
    setAssetType("image");
    setAssetFile(null);
    setSubmitError(null);
    setIsDragging(false);
  }

  function matchesAssetType(file: File, type: AssetType) {
    if (type === "image") return file.type.startsWith("image/");
    if (type === "video") return file.type.startsWith("video/");
    if (type === "music") return file.type.startsWith("audio/");
    return false;
  }

  function handleFileSelect(file: File) {
    if (!matchesAssetType(file, assetType)) {
      setSubmitError(`所选文件与「${assetTypeConfig[assetType].label}」类型不匹配`);
      return;
    }
    setAssetFile(file);
    setSubmitError(null);
    if (!name.trim()) {
      setName(file.name.replace(/\.[^.]+$/, ""));
    }
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) handleFileSelect(file);
    event.target.value = "";
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  async function handleUpload() {
    if (!name.trim() || !assetFile) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const mappedType =
        assetType === "music" ? "audio" : (assetType as "image" | "video");
      await uploadFileToStorage(assetFile, {
        assetType: mappedType,
        name: name.trim(),
        register: true,
      });
      setOpen(false);
      resetForm();
      onUploaded();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "上传失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <DialogTrigger
        render={<Button className="cursor-pointer transition-colors duration-200" />}
      >
        <Plus className="h-4 w-4 mr-2" />
        上传素材
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>上传素材</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="asset-name">素材名称</Label>
            <Input
              id="asset-name"
              placeholder="输入素材名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="transition-colors duration-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="asset-type">素材类型</Label>
            <Select
              value={assetType}
              onValueChange={(value) => setAssetType(value as AssetType)}
            >
              <SelectTrigger id="asset-type" className="cursor-pointer">
                <SelectValue placeholder="选择素材类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image" className="cursor-pointer">图片</SelectItem>
                <SelectItem value="video" className="cursor-pointer">视频</SelectItem>
                <SelectItem value="music" className="cursor-pointer">音乐</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>上传文件</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept={
                assetType === "image"
                  ? "image/*"
                  : assetType === "video"
                    ? "video/*"
                    : "audio/*"
              }
              className="hidden"
              onChange={handleFileInputChange}
            />
            {assetFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
                <Upload className="h-8 w-8 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{assetFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(assetFile.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAssetFile(null)}
                  className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 transition-colors duration-200 cursor-pointer ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 bg-muted/50 hover:border-primary/50 hover:bg-muted"
                }`}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  点击或拖拽上传文件
                </p>
                <p className="text-xs text-muted-foreground/70">
                  当前类型：{assetTypeConfig[assetType].label}
                </p>
              </button>
            )}
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <Button
            onClick={handleUpload}
            disabled={!name.trim() || !assetFile || isSubmitting}
            className="w-full cursor-pointer"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isSubmitting ? "上传中..." : "确认上传"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
