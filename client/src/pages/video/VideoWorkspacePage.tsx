/**
 * 视频改编工作台
 *
 * 最小前端：项目创建、脚本生成、Bridge 状态和渲染提交。
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clapperboard,
  Film,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Video,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  checkBridgeHealth,
  createVideoProject,
  deleteVideoProject,
  generateVideoScript,
  getVideoRenderStatus,
  listVideoProjects,
  submitVideoRender,
  type CreateVideoProjectPayload,
  type VideoProject,
  type VideoScriptOptions,
} from "@/api/video";
import { queryKeys } from "@/api/queryKeys";
import { getNovelList } from "@/api/novel/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  script_ready: "脚本已生成",
  rendering: "渲染中",
  completed: "已完成",
  failed: "失败",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  chapter_adaptation: "章节改编",
  trailer: "预告片",
  custom: "自定义",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "rendering") return "secondary";
  return "outline";
}

// ── 项目卡片 ──────────────────────────────────────────────

function ProjectCard(props: {
  project: VideoProject;
  busy: boolean;
  onGenerateScript: () => void;
  onSubmitRender: () => void;
  onCheckStatus: () => void;
  onDelete: () => void;
}) {
  const { project, busy } = props;
  const hasScript = Boolean(project.scriptJson);

  return (
    <Card className="rounded-lg">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg leading-6">{project.title}</CardTitle>
            <Badge variant="secondary">{SOURCE_TYPE_LABELS[project.sourceType] ?? project.sourceType}</Badge>
            <Badge variant={statusVariant(project.status)}>{statusLabel(project.status)}</Badge>
          </div>
          <CardDescription>
            {project.novel?.title ? `《${project.novel.title}》` : "无关联小说"}
            {project.pipeline ? ` · ${project.pipeline}` : ""}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {project.errorMessage ? (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {project.errorMessage}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={props.onGenerateScript}>
            <Sparkles className="h-4 w-4" />
            {hasScript ? "重新生成脚本" : "生成视频脚本"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !hasScript}
            onClick={props.onSubmitRender}
          >
            <Send className="h-4 w-4" />
            提交渲染
          </Button>
          {project.status === "rendering" ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={props.onCheckStatus}>
              <RefreshCw className="h-4 w-4" />
              刷新状态
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={props.onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {project.resultUrl ? (
          <div className="rounded-md border bg-green-500/5 p-3 text-sm text-green-600">
            渲染完成：{project.resultUrl}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── 主页面 ────────────────────────────────────────────────

export default function VideoWorkspacePage() {
  const queryClient = useQueryClient();
  const [busyProjectId, setBusyProjectId] = useState("");
  const [form, setForm] = useState({
    title: "",
    novelId: "",
    sourceType: "chapter_adaptation" as "chapter_adaptation" | "trailer" | "custom",
    targetDurationSec: "60",
    visualStyle: "cinematic",
  });

  const projectsQuery = useQuery({
    queryKey: queryKeys.video.projects,
    queryFn: () => listVideoProjects(),
  });
  const novelsQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 100),
    queryFn: () => getNovelList({ page: 1, limit: 100 }),
  });
  const bridgeQuery = useQuery({
    queryKey: queryKeys.video.bridgeHealth,
    queryFn: checkBridgeHealth,
    staleTime: 30_000,
  });

  const projects = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data?.data]);
  const novels = useMemo(() => novelsQuery.data?.data?.items ?? [], [novelsQuery.data?.data?.items]);
  const bridgeHealth = bridgeQuery.data?.data;
  const bridgeReachable = bridgeHealth?.reachable ?? false;

  const createMutation = useMutation({
    mutationFn: (payload: CreateVideoProjectPayload) => createVideoProject(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.video.projects });
      toast.success("视频项目已创建。");
      setForm((c) => ({ ...c, title: "", novelId: "" }));
    },
  });

  const scriptMutation = useMutation({
    mutationFn: ({ projectId, options }: { projectId: string; options: VideoScriptOptions }) =>
      generateVideoScript(projectId, options),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.video.projects });
      toast.success("视频脚本已生成。");
    },
    onSettled: () => setBusyProjectId(""),
  });

  const renderMutation = useMutation({
    mutationFn: (projectId: string) => submitVideoRender(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.video.projects });
      toast.success("渲染任务已提交。");
    },
    onSettled: () => setBusyProjectId(""),
  });

  const statusMutation = useMutation({
    mutationFn: (projectId: string) => getVideoRenderStatus(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.video.projects });
      toast.success("渲染状态已刷新。");
    },
    onSettled: () => setBusyProjectId(""),
  });

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => deleteVideoProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.video.projects });
      toast.success("视频项目已删除。");
    },
  });

  const handleCreate = () => {
    if (!form.title.trim()) {
      toast.error("请填写项目名称。");
      return;
    }
    createMutation.mutate({
      title: form.title.trim(),
      novelId: form.novelId || undefined,
      sourceType: form.sourceType,
    });
  };

  const handleGenerateScript = (project: VideoProject) => {
    setBusyProjectId(project.id);
    scriptMutation.mutate({
      projectId: project.id,
      options: {
        targetDurationSec: Number(form.targetDurationSec) || 60,
        visualStyle: form.visualStyle || "cinematic",
      },
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-normal">视频改编工作台</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          将小说章节改编为短视频或预告片。AI 生成视频脚本后提交到 OpenMontage 渲染。
        </p>
      </div>

      {/* Bridge 状态 */}
      <div className="flex items-center gap-3 rounded-md border px-4 py-3">
        {bridgeReachable ? (
          <Wifi className="h-5 w-5 text-green-500" />
        ) : (
          <WifiOff className="h-5 w-5 text-muted-foreground" />
        )}
        <div className="flex-1 text-sm">
          <span className="font-medium">OpenMontage Bridge</span>
          {bridgeReachable ? (
            <span className="ml-2 text-green-600">
              已连接 · {bridgeHealth?.toolNames?.length ?? 0} 个工具可用
            </span>
          ) : (
            <span className="ml-2 text-muted-foreground">
              未连接 — 请启动 Bridge（<code>python tools/openmontage-bridge/server.py</code>）
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={bridgeQuery.isFetching}
          onClick={() => void bridgeQuery.refetch()}
        >
          <RefreshCw className={`h-4 w-4 ${bridgeQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
        {/* 左栏：创建 */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">
              <Film className="mr-2 inline h-5 w-5" />
              新建视频项目
            </CardTitle>
            <CardDescription>选择要改编的小说或直接创建自定义视频项目。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">项目名称</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.title}
                placeholder="例如：逆袭之路预告片"
                onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">关联小说</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.novelId}
                onChange={(e) => {
                  const novel = novels.find((n) => n.id === e.target.value);
                  setForm((c) => ({
                    ...c,
                    novelId: e.target.value,
                    title: novel?.title ? `《${novel.title}》视频版` : c.title,
                  }));
                }}
              >
                <option value="">不关联小说（自定义）</option>
                {novels.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title || "未命名小说"}（{novel._count.chapters} 章）
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">类型</span>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.sourceType}
                  onChange={(e) => setForm((c) => ({ ...c, sourceType: e.target.value as typeof c.sourceType }))}
                >
                  <option value="chapter_adaptation">章节改编</option>
                  <option value="trailer">预告片</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">目标时长（秒）</span>
                <input
                  type="number"
                  min="10"
                  max="600"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.targetDurationSec}
                  onChange={(e) => setForm((c) => ({ ...c, targetDurationSec: e.target.value }))}
                />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">视觉风格</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.visualStyle}
                onChange={(e) => setForm((c) => ({ ...c, visualStyle: e.target.value }))}
              >
                <option value="cinematic">电影感</option>
                <option value="anime">动漫风</option>
                <option value="watercolor">水彩风</option>
                <option value="3d_realistic">3D 写实</option>
                <option value="minimalist">极简</option>
              </select>
            </label>
            <Button
              type="button"
              className="w-full"
              disabled={createMutation.isPending}
              onClick={handleCreate}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              创建视频项目
            </Button>
          </CardContent>
        </Card>

        {/* 右栏：项目列表 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-normal">
                <Video className="mr-2 inline h-5 w-5" />
                项目列表
              </h2>
              <p className="text-sm text-muted-foreground">
                从脚本生成到渲染提交的视频制作流程。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={projectsQuery.isFetching}
              onClick={() => void projectsQuery.refetch()}
            >
              <RefreshCw className={`h-4 w-4 ${projectsQuery.isFetching ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>

          {projectsQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载视频项目...
            </div>
          ) : null}

          {!projectsQuery.isLoading && projects.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              <Clapperboard className="mx-auto mb-2 h-8 w-8 opacity-40" />
              还没有视频项目。先在左侧创建一个项目。
            </div>
          ) : null}

          <div className="grid gap-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                busy={busyProjectId === project.id}
                onGenerateScript={() => handleGenerateScript(project)}
                onSubmitRender={() => {
                  setBusyProjectId(project.id);
                  renderMutation.mutate(project.id);
                }}
                onCheckStatus={() => {
                  setBusyProjectId(project.id);
                  statusMutation.mutate(project.id);
                }}
                onDelete={() => deleteMutation.mutate(project.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
