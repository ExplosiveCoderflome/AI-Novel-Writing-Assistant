import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers3, ListVideo, Plus, RefreshCw, Sparkles } from "lucide-react";
import {
  assembleDramaSourceBundle,
  createDramaProject,
  generateDramaOutline,
  generateDramaStrategy,
  listDramaProjects,
  type CreateDramaProjectPayload,
  type DramaProject,
  type DramaSourceType,
} from "@/api/drama";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

const TRACK_OPTIONS = [
  { value: "counterattack", label: "逆袭" },
  { value: "rebirth_revenge", label: "重生复仇" },
  { value: "war_god", label: "战神归来" },
  { value: "live_in_son", label: "赘婿" },
  { value: "miracle_doctor", label: "神医" },
  { value: "rich_family", label: "豪门恩怨" },
  { value: "sweet_love", label: "甜宠" },
  { value: "hidden_identity", label: "马甲文" },
] as const;

const SOURCE_LABELS: Record<DramaSourceType, string> = {
  novel_import: "小说导入",
  original: "原创短剧",
  text_import: "文本导入",
};

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "素材准备",
    strategized: "策略已生成",
    outlined: "分集已生成",
    scripting: "台本生成中",
    completed: "已完成",
  };
  return labels[status] ?? status;
}

function buildCreatePayload(form: {
  title: string;
  source: DramaSourceType;
  sourceRef: string;
  inspiration: string;
  rawText: string;
  track: string;
  theme: string;
  targetEpisodes: string;
}): CreateDramaProjectPayload {
  return {
    title: form.title.trim(),
    source: form.source,
    sourceRef: form.source === "novel_import" ? form.sourceRef.trim() : undefined,
    inspiration: form.source === "original" ? form.inspiration.trim() : undefined,
    rawText: form.source === "text_import" ? form.rawText.trim() : undefined,
    track: form.track,
    theme: form.theme.trim() || undefined,
    targetEpisodes: Number(form.targetEpisodes) || 80,
  };
}

function ProjectCard(props: {
  project: DramaProject;
  busyProjectId: string;
  onAssemble: (project: DramaProject) => void;
  onStrategy: (project: DramaProject) => void;
  onOutline: (project: DramaProject) => void;
}) {
  const isBusy = props.busyProjectId === props.project.id;

  return (
    <Card className="rounded-lg">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg leading-6">{props.project.title}</CardTitle>
            <Badge variant="secondary">{SOURCE_LABELS[props.project.source]}</Badge>
            <Badge variant="outline">{statusLabel(props.project.status)}</Badge>
          </div>
          <CardDescription>
            {props.project.track || "未选择赛道"} · {props.project.targetEpisodes} 集
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() => props.onAssemble(props.project)}
        >
          <Layers3 className="h-4 w-4" />
          整理素材
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() => props.onStrategy(props.project)}
        >
          <Sparkles className="h-4 w-4" />
          生成策略
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isBusy}
          onClick={() => props.onOutline(props.project)}
        >
          <ListVideo className="h-4 w-4" />
          生成前 12 集
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DramaWorkspacePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    source: "original" as DramaSourceType,
    sourceRef: "",
    inspiration: "",
    rawText: "",
    track: "counterattack",
    theme: "",
    targetEpisodes: "80",
  });
  const [busyProjectId, setBusyProjectId] = useState("");

  const projectsQuery = useQuery({
    queryKey: queryKeys.drama.projects,
    queryFn: listDramaProjects,
  });

  const projects = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data?.data]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateDramaProjectPayload) => createDramaProject(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.drama.projects });
      toast.success("短剧项目已创建。");
      setForm((current) => ({
        ...current,
        title: "",
        sourceRef: "",
        inspiration: "",
        rawText: "",
        theme: "",
      }));
    },
  });

  const runProjectAction = async (
    project: DramaProject,
    action: (projectId: string) => Promise<unknown>,
    successMessage: string,
  ) => {
    setBusyProjectId(project.id);
    try {
      await action(project.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.drama.projects });
      await queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(project.id) });
      toast.success(successMessage);
    } finally {
      setBusyProjectId("");
    }
  };

  const handleCreate = () => {
    if (!form.title.trim()) {
      toast.error("请先填写短剧项目名。");
      return;
    }
    if (form.source === "novel_import" && !form.sourceRef.trim()) {
      toast.error("请填写要导入的小说 ID。");
      return;
    }
    if (form.source === "original" && !form.inspiration.trim()) {
      toast.error("请填写原创灵感。");
      return;
    }
    if (form.source === "text_import" && !form.rawText.trim()) {
      toast.error("请粘贴要整理的文本。");
      return;
    }
    createMutation.mutate(buildCreatePayload(form));
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-normal">短剧工作台</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          从小说、原创灵感或导入文本整理短剧素材，再生成竖屏付费短剧策略和分集台本。
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">新建短剧项目</CardTitle>
            <CardDescription>选择内容来源，系统会整理为可进入短剧产线的素材包。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">项目名</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">内容来源</span>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.source}
                  onChange={(event) => setForm((current) => ({ ...current, source: event.target.value as DramaSourceType }))}
                >
                  <option value="original">原创短剧</option>
                  <option value="novel_import">导入小说</option>
                  <option value="text_import">粘贴文本</option>
                </select>
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">赛道</span>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.track}
                  onChange={(event) => setForm((current) => ({ ...current, track: event.target.value }))}
                >
                  {TRACK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {form.source === "novel_import" ? (
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">小说 ID</span>
                <input
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.sourceRef}
                  onChange={(event) => setForm((current) => ({ ...current, sourceRef: event.target.value }))}
                />
              </label>
            ) : null}

            {form.source === "original" ? (
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">原创灵感</span>
                <textarea
                  className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.inspiration}
                  onChange={(event) => setForm((current) => ({ ...current, inspiration: event.target.value }))}
                />
              </label>
            ) : null}

            {form.source === "text_import" ? (
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">导入文本</span>
                <textarea
                  className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.rawText}
                  onChange={(event) => setForm((current) => ({ ...current, rawText: event.target.value }))}
                />
              </label>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">题材补充</span>
                <input
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.theme}
                  onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">目标集数</span>
                <input
                  type="number"
                  min="1"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.targetEpisodes}
                  onChange={(event) => setForm((current) => ({ ...current, targetEpisodes: event.target.value }))}
                />
              </label>
            </div>

            <Button type="button" className="w-full" disabled={createMutation.isPending} onClick={handleCreate}>
              <Plus className="h-4 w-4" />
              {createMutation.isPending ? "创建中..." : "创建短剧项目"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-normal">项目</h2>
              <p className="text-sm text-muted-foreground">先整理素材，再生成策略和分集。</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={projectsQuery.isFetching}
              onClick={() => void projectsQuery.refetch()}
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </div>

          {projectsQuery.isLoading ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">正在加载短剧项目...</div>
          ) : null}

          {!projectsQuery.isLoading && projects.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              还没有短剧项目。先从左侧创建一个项目。
            </div>
          ) : null}

          <div className="grid gap-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                busyProjectId={busyProjectId}
                onAssemble={(item) => void runProjectAction(item, assembleDramaSourceBundle, "短剧素材已整理。")}
                onStrategy={(item) => void runProjectAction(item, generateDramaStrategy, "短剧策略已生成。")}
                onOutline={(item) => void runProjectAction(
                  item,
                  (projectId) => generateDramaOutline(projectId, { startOrder: 1, count: 12 }),
                  "前 12 集分集已生成。",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
