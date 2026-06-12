import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenText,
  FilePen,
  Layers3,
  Plus,
  Sparkles,
  SquareStack,
} from "lucide-react";
import {
  createComicProject,
  importComicSourceBundle,
  listComicProjects,
  type ComicProject,
  type ComicSourceType,
  type CreateComicProjectPayload,
} from "@/api/comic";
import { getNovelList } from "@/api/novel/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<ComicSourceType, string> = {
  novel_import: "导入小说",
  original: "原创灵感",
  text_import: "文本导入",
  comic_import: "漫画改编",
};

const STYLE_PRESETS = [
  { value: "webtoon_color", label: "彩色韩漫" },
  { value: "bl_manga", label: "彩色少女漫" },
  { value: "shounen_bw", label: "黑白少年漫" },
  { value: "ink_traditional", label: "水墨国风" },
  { value: "chibi", label: "Q 版萌漫" },
];

const WIZARD_STEPS = [
  { key: "source", label: "来源" },
  { key: "content", label: "内容" },
  { key: "style", label: "画风" },
] as const;

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "outlined" || status === "scripted") return "default";
  if (status === "draft") return "secondary";
  return "outline";
}
function statusLabel(s: string) {
  const m: Record<string, string> = {
    draft: "草稿", outlined: "大纲已生成", scripted: "脚本已生成", completed: "已完成",
  };
  return m[s] ?? s;
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  busyId,
  onImport,
}: {
  project: ComicProject;
  busyId: string;
  onImport: (p: ComicProject) => void;
}) {
  const busy = busyId === project.id;
  return (
    <Card className="rounded-lg">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg leading-6">{project.title}</CardTitle>
            <Badge variant="secondary">{SOURCE_LABELS[project.sourceType]}</Badge>
            <Badge variant={statusBadgeVariant(project.status)}>{statusLabel(project.status)}</Badge>
          </div>
          <CardDescription>
            {project._count?.episodes ?? 0} 话 · {project._count?.characters ?? 0} 角色
            {project.sourceBundle ? " · 已导入内容源" : ""}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild type="button" size="sm">
          <Link to={`/comic/projects/${project.id}`}>
            打开工作台
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        {!project.sourceBundle && project.sourceType === "novel_import" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onImport(project)}
          >
            <Layers3 className="h-4 w-4" />
            导入内容源
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

function CreateWizard({ onCreated }: { onCreated: (id: string) => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    title: "",
    sourceType: "original" as ComicSourceType,
    sourceRef: "",
    inspiration: "",
    rawText: "",
    style: "webtoon_color",
  });

  const { data: novels } = useQuery({
    queryKey: ["novels"],
    queryFn: () => getNovelList(),
    enabled: form.sourceType === "novel_import",
  });

  const createMut = useMutation({
    mutationFn: (payload: CreateComicProjectPayload) => createComicProject(payload),
    onSuccess: (proj) => {
      toast.success("漫画项目已创建");
      onCreated(proj.id);
    },
  });

  const canNext = () => {
    if (step === 0) return form.title.trim().length > 0;
    if (step === 1) {
      if (form.sourceType === "novel_import") return Boolean(form.sourceRef);
      if (form.sourceType === "original") return form.inspiration.trim().length > 0;
      if (form.sourceType === "text_import") return form.rawText.trim().length > 0;
      return true;
    }
    return true;
  };

  const handleSubmit = () => {
    createMut.mutate({
      title: form.title.trim(),
      sourceType: form.sourceType,
      sourceRef: form.sourceType === "novel_import" ? form.sourceRef : undefined,
      inspiration: form.sourceType === "original" ? form.inspiration.trim() : undefined,
      rawText: form.sourceType === "text_import" ? form.rawText.trim() : undefined,
    });
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">新建漫画项目</CardTitle>
        <div className="flex gap-2 pt-1">
          {WIZARD_STEPS.map((s, i) => (
            <span
              key={s.key}
              className={`rounded px-2 py-0.5 text-xs font-medium ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-muted text-muted-foreground line-through" : "bg-muted text-muted-foreground"}`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 0 && (
          <>
            <div className="space-y-1">
              <label className="text-sm font-medium">项目标题</label>
              <Input
                placeholder="漫画标题"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">内容来源</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SOURCE_LABELS) as ComicSourceType[]).filter(t => t !== "comic_import").map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, sourceType: t }))}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${form.sourceType === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted hover:bg-accent"}`}
                  >
                    {SOURCE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            {form.sourceType === "novel_import" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">选择小说</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.sourceRef}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((f) => ({ ...f, sourceRef: e.target.value }))}
                >
                  <option value="">—— 选择小说 ——</option>
                  {novels?.data?.items?.map((n) => (
                    <option key={n.id} value={n.id}>{n.title ?? "未命名"}</option>
                  ))}
                </select>
              </div>
            )}
            {form.sourceType === "original" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">故事灵感</label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y min-h-[120px]"
                  placeholder="简短描述故事的核心设定、主角和大方向（200-800 字）…"
                  rows={6}
                  value={form.inspiration}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm((f) => ({ ...f, inspiration: e.target.value }))}
                />
              </div>
            )}
            {form.sourceType === "text_import" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">粘贴原文</label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y min-h-[160px]"
                  placeholder="粘贴完整小说原文（最多 20 万字）…"
                  rows={8}
                  value={form.rawText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm((f) => ({ ...f, rawText: e.target.value }))}
                />
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">画风预设</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STYLE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, style: p.value }))}
                  className={`rounded-lg border p-3 text-sm font-medium transition-colors ${form.style === p.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted hover:bg-accent"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
          >
            上一步
          </Button>
          {step < WIZARD_STEPS.length - 1 ? (
            <Button
              type="button"
              size="sm"
              disabled={!canNext()}
              onClick={() => setStep((s) => s + 1)}
            >
              下一步
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={createMut.isPending}
              onClick={handleSubmit}
            >
              {createMut.isPending ? "创建中…" : "创建项目"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComicWorkspacePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showWizard, setShowWizard] = useState(false);
  const [busyId, setBusyId] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["comic", "projects"],
    queryFn: listComicProjects,
  });

  const importMut = useMutation({
    mutationFn: (projectId: string) => importComicSourceBundle(projectId),
    onMutate: (id) => setBusyId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "projects"] });
      toast.success("内容源导入完成");
    },
    onSettled: () => setBusyId(""),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <SquareStack className="h-6 w-6 text-primary" />
            漫画改编工作台
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            将小说或原创故事一键生成条漫分格脚本与图像
          </p>
        </div>
        <Button type="button" onClick={() => setShowWizard((v) => !v)}>
          <Plus className="h-4 w-4" />
          新建项目
        </Button>
      </div>

      {showWizard && (
        <CreateWizard
          onCreated={(id) => {
            setShowWizard(false);
            queryClient.invalidateQueries({ queryKey: ["comic", "projects"] });
            navigate(`/comic/projects/${id}`);
          }}
        />
      )}

      {isLoading && (
        <div className="py-12 text-center text-muted-foreground text-sm">加载中…</div>
      )}

      {!isLoading && projects.length === 0 && !showWizard && (
        <Card className="py-16 text-center">
          <CardContent className="flex flex-col items-center gap-4">
            <FilePen className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">还没有漫画项目，点击「新建项目」开始</p>
            <Button type="button" onClick={() => setShowWizard(true)}>
              <Plus className="h-4 w-4" />
              新建项目
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {projects.map((proj) => (
          <ProjectCard
            key={proj.id}
            project={proj}
            busyId={busyId}
            onImport={(p) => importMut.mutate(p.id)}
          />
        ))}
      </div>
    </div>
  );
}
