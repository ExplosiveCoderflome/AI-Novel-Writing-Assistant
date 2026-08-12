import i18next from "i18next";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image, Play, RefreshCw, CheckCircle2, XCircle, FolderOpen, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export interface DownloadProgressInfo {
  isDownloading: boolean;
  fileName: string;
  downloadedMB: number;
  totalMB: number;
  percent: number;
  error?: string | null;
}

export interface ComfyUIHealth {
  ok: boolean;
  baseURL: string;
  activeModel?: string;
  checkpoints: string[];
  message: string;
  autoStarted?: boolean;
  discoveredPath?: string | null;
  checkpointsDir?: string | null;
  downloadProgress?: DownloadProgressInfo;
}

export default function ComfyUIDiagnosticsCard() {
  const queryClient = useQueryClient();
  const [customPath, setCustomPath] = useState("");

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["settings", "comfyui-status"],
    queryFn: async () => {
      const res = await fetch("/api/settings/comfyui/status");
      if (!res.ok) throw new Error(i18next.t("settings.comfyUIDiagnosticsCard.53ev7c"));
      const json = await res.json();
      return json.data as ComfyUIHealth;
    },
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const d = query.state.data as ComfyUIHealth | undefined;
      return d?.downloadProgress?.isDownloading ? 1000 : false;
    },
  });

  const launchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/comfyui/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPath: customPath.trim() || undefined }),
      });
      if (!res.ok) throw new Error(i18next.t("settings.comfyUIDiagnosticsCard.om71p9"));
      const json = await res.json();
      return json.data as ComfyUIHealth;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["settings", "comfyui-status"] });
      if (result.ok) {
        toast.success(i18next.t("settings.comfyUIDiagnosticsCard.u84t4v", { val1: result.baseURL, val2: result.checkpoints.join(", ") || "已识别" }));
      } else {
        toast.error(i18next.t("settings.comfyUIDiagnosticsCard.94953j", { val1: result.message }));
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "拉起 ComfyUI 进程失败");
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/comfyui/download-model", {
        method: "POST",
      });
      if (!res.ok) throw new Error(i18next.t("settings.comfyUIDiagnosticsCard.1gck6p"));
      const json = await res.json();
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "comfyui-status"] });
      toast.info(i18next.t("settings.comfyUIDiagnosticsCard.sfrnih"));
    },
    onError: (err: any) => {
      toast.error(err.message || "触发模型下载失败");
    },
  });

  const health = data;
  const isDownloading = health?.downloadProgress?.isDownloading;
  const progress = health?.downloadProgress;

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Image className="h-5 w-5 text-primary" />
            ComfyUI 本地离线画师自检与拉起
          </CardTitle>
          <CardDescription>{i18next.t("settings.comfyUIDiagnosticsCard.725n0e")}</CardDescription>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          disabled={isLoading || isRefetching}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading || isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />{i18next.t("settings.comfyUIDiagnosticsCard.msw8cz")}</div>
        ) : (
          <div className="space-y-4">
            {/* Status Alert Banner */}
            <div className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
              health?.ok
                ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
                : "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
            }`}>
              <div className="mt-0.5">
                {health?.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-amber-600" />}
              </div>
              <div className="space-y-1 flex-1">
                <div className="font-bold flex items-center gap-2">
                  {health?.ok ? "ComfyUI 已连接在线" : "ComfyUI 当前未运行 (点击一键拉起)"}
                  <Badge variant={health?.ok ? "default" : "destructive"}>
                    {health?.ok ? "ONLINE" : "OFFLINE"}
                  </Badge>
                </div>
                <div className="text-xs opacity-90 leading-relaxed">{health?.message}</div>
              </div>
            </div>

            {/* Live Model Download Progress Bar */}
            {isDownloading && progress && (
              <div className="space-y-1.5 rounded-md border p-3 bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
                <div className="flex items-center justify-between text-xs font-bold text-blue-700 dark:text-blue-300">
                  <span className="flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5 animate-bounce" />
                    全自动模型权重下载中 ({progress.fileName})
                  </span>
                  <span>{progress.percent}% ({progress.downloadedMB}MB / {progress.totalMB}MB)</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
            )}

            {/* Path and Checkpoints info */}
            <div className="grid gap-3 text-xs md:grid-cols-2">
              <div className="rounded-md border p-3 bg-muted/40 flex flex-col gap-2">
                <span className="font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5" />{i18next.t("settings.comfyUIDiagnosticsCard.3lvs8j")}</span>
                <span className="font-mono text-foreground break-all">
                  {health?.discoveredPath || "全盘自动匹配中（可下方手动指定）"}
                </span>
              </div>

              <div className="rounded-md border p-3 bg-muted/40 flex flex-col gap-2">
                <span className="font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>{i18next.t("settings.comfyUIDiagnosticsCard.kjqcqy")}</span>
                  {health?.checkpoints.length === 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[11px] text-primary gap-1"
                      onClick={() => downloadMutation.mutate()}
                      disabled={downloadMutation.isPending || isDownloading}
                    >
                      <Download className="h-3 w-3" />{i18next.t("settings.comfyUIDiagnosticsCard.gkhpx0")}</Button>
                  )}
                </span>
                <div className="flex flex-wrap gap-1">
                  {health?.checkpoints && health.checkpoints.length > 0 ? (
                    health.checkpoints.map(c => (
                      <Badge key={c} variant="outline" className="text-[11px] font-mono">
                        {c}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-[11px]">
                      {isDownloading ? "基础模型正在后台下载中..." : "暂未找到模型权重 (点击右侧【自动下载】获取)"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Path Input & Launch Button */}
            <div className="flex items-center gap-2 pt-1">
              <Input
                className="h-8 text-xs font-mono flex-1"
                placeholder={i18next.t("settings.comfyUIDiagnosticsCard.6ey0tl")}
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
              />
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => launchMutation.mutate()}
                disabled={launchMutation.isPending}
              >
                {launchMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                一键自动检测并启动 ComfyUI
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
