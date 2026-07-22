import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpenText, FileText, Layers3, Lightbulb, ListVideo, Plus, RefreshCw, Sparkles } from "lucide-react";
import {
  assembleDramaSourceBundle,
  createDramaProject,
  generateDramaOutline,
  generateDramaStrategy,
  listDramaProjects,
  recommendDramaTrack,
  type CreateDramaProjectPayload,
  type DramaTrackRecommendation,
  type DramaProject,
  type DramaSourceType,
} from "@/api/drama";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { getNovelList } from "@/api/novel/core";
import { DRAMA_SOURCE_LABELS, DRAMA_TRACK_OPTIONS, dramaTrackLabel } from "./dramaDisplay";
import SelectControl from "@/components/common/SelectControl";

const WIZARD_STEPS = [
  { key: "source", label: t("gen.pages.drama.DramaWorkspacePage.gen_26ca20b1") },
  { key: "content", label: t("gen.pages.drama.DramaWorkspacePage.gen_2d711b09") },
  { key: "settings", label: t("gen.pages.drama.DramaWorkspacePage.gen_ea887bd0") },
] as const;

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: t("gen.pages.drama.DramaWorkspacePage.gen_4f1e5fdf"),
    strategized: t("gen.pages.drama.DramaWorkspacePage.gen_301c0f79"),
    outlined: t("gen.pages.drama.DramaWorkspacePage.gen_e524427a"),
    scripting: t("gen.pages.drama.DramaWorkspacePage.gen_92bb42ba"),
    completed: t("gen.pages.drama.DramaWorkspacePage.gen_fad5222c"),
  };
  return labels[status] ?? status;
}

function buildRecommendationDigest(form: {
  source: DramaSourceType;
  inspiration: string;
  rawText: string;
  sourceRef: string;
}, selectedNovel?: { title?: string | null; _count?: { chapters: number } } | null): string {
  if (form.source === "original") {
    return form.inspiration.trim();
  }
  if (form.source === "text_import") {
    return form.rawText.trim().slice(0, 12000);
  }
  if (selectedNovel) {
    return `已选择小说《${selectedNovel.title || t("gen.pages.drama.DramaWorkspacePage.gen_e3f46686")}》，共 ${selectedNovel._count?.chapters ?? 0} 章。`;
  }
  return "";
}

function hasSourceContent(form: {
  source: DramaSourceType;
  inspiration: string;
  rawText: string;
  sourceRef: string;
}): boolean {
  if (form.source === "novel_import") {
    return Boolean(form.sourceRef.trim());
  }
  if (form.source === "original") {
    return Boolean(form.inspiration.trim());
  }
  return Boolean(form.rawText.trim());
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
            <Badge variant="secondary">{DRAMA_SOURCE_LABELS[props.project.source]}</Badge>
            <Badge variant="outline">{statusLabel(props.project.status)}</Badge>
          </div>
          <CardDescription>
            {dramaTrackLabel(props.project.track)} · {props.project.targetEpisodes} 集
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild type="button" size="sm">
          <Link to={`/drama/projects/${props.project.id}`}>
            打开工作台
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
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
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
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
  const [trackRecommendation, setTrackRecommendation] = useState<DramaTrackRecommendation | null>(null);

  const projectsQuery = useQuery({
    queryKey: queryKeys.drama.projects,
    queryFn: listDramaProjects,
  });
  const novelsQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 100),
    queryFn: () => getNovelList({ page: 1, limit: 100 }),
  });

  const projects = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data?.data]);
  const novels = useMemo(() => novelsQuery.data?.data?.items ?? [], [novelsQuery.data?.data?.items]);
  const selectedNovel = useMemo(
    () => novels.find((novel) => novel.id === form.sourceRef),
    [form.sourceRef, novels],
  );
  const canRecommendTrack = hasSourceContent(form);

  const createMutation = useMutation({
    mutationFn: (payload: CreateDramaProjectPayload) => createDramaProject(payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.drama.projects });
      toast.success(t("gen.pages.drama.DramaWorkspacePage.gen_830d6c93"));
      if (response.data?.id) {
        navigate(`/drama/projects/${response.data.id}`);
        return;
      }
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

  const trackRecommendationMutation = useMutation({
    mutationFn: () => recommendDramaTrack({
      title: form.title.trim() || selectedNovel?.title || t("gen.pages.drama.DramaWorkspacePage.gen_10f4511a"),
      sourceType: form.source,
      sourceDigest: buildRecommendationDigest(form, selectedNovel),
      theme: form.theme.trim() || undefined,
      targetEpisodes: Number(form.targetEpisodes) || 80,
    }),
    onSuccess: (response) => {
      const recommendation = response.data;
      if (recommendation) {
        setTrackRecommendation(recommendation);
        setForm((current) => ({ ...current, track: recommendation.recommendedTrack }));
        toast.success(t("gen.pages.drama.DramaWorkspacePage.gen_e9a53cf6"));
      }
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

  const validateCurrentStep = () => {
    if (stepIndex === 0) {
      return true;
    }
    if (stepIndex === 1) {
      if (form.source === "novel_import" && !form.sourceRef.trim()) {
        toast.error(t("gen.pages.drama.DramaWorkspacePage.gen_3a3792cc"));
        return false;
      }
      if (form.source === "original" && !form.inspiration.trim()) {
        toast.error(t("gen.pages.drama.DramaWorkspacePage.gen_5e5e9d94"));
        return false;
      }
      if (form.source === "text_import" && !form.rawText.trim()) {
        toast.error(t("gen.pages.drama.DramaWorkspacePage.gen_f769bdcc"));
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateCurrentStep()) {
      return;
    }
    setStepIndex((current) => Math.min(current + 1, WIZARD_STEPS.length - 1));
  };

  const handleCreate = () => {
    if (!validateCurrentStep()) {
      return;
    }
    if (!form.title.trim()) {
      toast.error(t("gen.pages.drama.DramaWorkspacePage.gen_a40e68f5"));
      return;
    }
    if (form.source === "novel_import" && !form.sourceRef.trim()) {
      toast.error(t("gen.pages.drama.DramaWorkspacePage.gen_3a3792cc"));
      return;
    }
    if (form.source === "original" && !form.inspiration.trim()) {
      toast.error(t("gen.pages.drama.DramaWorkspacePage.gen_5e5e9d94"));
      return;
    }
    if (form.source === "text_import" && !form.rawText.trim()) {
      toast.error(t("gen.pages.drama.DramaWorkspacePage.gen_f769bdcc"));
      return;
    }
    createMutation.mutate(buildCreatePayload(form));
  };

  const chooseSource = (source: DramaSourceType) => {
    setForm((current) => ({
      ...current,
      source,
      sourceRef: "",
      title: source === "original" && !current.title ? t("gen.pages.drama.DramaWorkspacePage.gen_83158a40") : current.title,
    }));
    setTrackRecommendation(null);
    setStepIndex(1);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-normal">{t("gen.pages.drama.DramaWorkspacePage.gen_8eb337a1")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          从小说、原创灵感或导入文本整理短剧素材，再生成竖屏付费短剧策略和分集台本。
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">{t("gen.pages.drama.DramaWorkspacePage.gen_295a420e")}</CardTitle>
            <CardDescription>{t("gen.pages.drama.DramaWorkspacePage.gen_ddcaf921")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {WIZARD_STEPS.map((step, index) => (
                <button
                  key={step.key}
                  type="button"
                  className={`rounded-md border px-3 py-2 text-sm ${stepIndex === index ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground"}`}
                  onClick={() => setStepIndex(index)}
                >
                  {index + 1}. {step.label}
                </button>
              ))}
            </div>

            {stepIndex === 0 ? (
              <div className="grid gap-3">
                <button type="button" className={`rounded-lg border p-3 text-left ${form.source === "novel_import" ? "border-primary bg-primary/5" : ""}`} onClick={() => chooseSource("novel_import")}>
                  <div className="flex items-center gap-2 font-medium"><BookOpenText className="h-4 w-4" />{t("gen.pages.drama.DramaWorkspacePage.gen_d093e95b")}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{t("gen.pages.drama.DramaWorkspacePage.adaptExistingNovel")}</p>
                </button>
                <button type="button" className={`rounded-lg border p-3 text-left ${form.source === "original" ? "border-primary bg-primary/5" : ""}`} onClick={() => chooseSource("original")}>
                  <div className="flex items-center gap-2 font-medium"><Lightbulb className="h-4 w-4" />{t("gen.pages.drama.DramaWorkspacePage.gen_4b6c8cee")}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{t("gen.pages.drama.DramaWorkspacePage.initFromInspirationSystemOrganize")}</p>
                </button>
                <button type="button" className={`rounded-lg border p-3 text-left ${form.source === "text_import" ? "border-primary bg-primary/5" : ""}`} onClick={() => chooseSource("text_import")}>
                  <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4" />{t("gen.pages.drama.DramaWorkspacePage.gen_28db289c")}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{t("gen.pages.drama.DramaWorkspacePage.gen_6e3c6f1f")}</p>
                </button>
              </div>
            ) : null}

            {stepIndex === 1 ? (
              <div className="space-y-4">
                {form.source === "novel_import" ? (
                  <>
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">{t("gen.pages.drama.DramaWorkspacePage.gen_44cddc3d")}</span>
                      <SelectControl
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={form.sourceRef}
                        disabled={novelsQuery.isLoading || novels.length === 0}
                        onChange={(event) => {
                          const novel = novels.find((item) => item.id === event.target.value);
                          setForm((current) => ({
                            ...current,
                            sourceRef: event.target.value,
                            title: novel?.title ? `《${novel.title}》短剧版` : current.title,
                          }));
                        }}
                      >
                        <option value="" disabled>
                          {novelsQuery.isLoading ? t("gen.pages.drama.DramaWorkspacePage.gen_3248501e") : novels.length > 0 ? t("gen.pages.drama.DramaWorkspacePage.gen_9d00f8ec") : t("gen.pages.drama.DramaWorkspacePage.gen_682c7475")}
                        </option>
                        {novels.map((novel) => (
                          <option key={novel.id} value={novel.id}>
                            {novel.title || t("gen.pages.drama.DramaWorkspacePage.gen_e3f46686")}（{novel._count.chapters} 章）
                          </option>
                        ))}
                      </SelectControl>
                    </label>
                    {selectedNovel ? (
                      <div className="rounded-md border p-3 text-sm text-muted-foreground">
                        已选择 {selectedNovel.title || t("gen.pages.drama.DramaWorkspacePage.gen_e3f46686")}，共 {selectedNovel._count.chapters} 章。创建后会先整理为短剧素材包。
                      </div>
                    ) : null}
                  </>
                ) : null}

                {form.source === "original" ? (
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">{t("gen.pages.drama.DramaWorkspacePage.gen_de6d7781")}</span>
                    <textarea
                      className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={form.inspiration}
                      placeholder={t("gen.pages.drama.DramaWorkspacePage.exampleWifeDivorcedRealSheWasInheritedPatronFamilyPubliclyRetaliateAllWhoHumiliatedHer")}
                      onChange={(event) => setForm((current) => ({ ...current, inspiration: event.target.value }))}
                    />
                  </label>
                ) : null}

                {form.source === "text_import" ? (
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">{t("gen.pages.drama.DramaWorkspacePage.gen_e0b20cd3")}</span>
                    <textarea
                      className="min-h-40 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={form.rawText}
                      placeholder={t("gen.pages.drama.DramaWorkspacePage.gen_d86e82ed")}
                      onChange={(event) => setForm((current) => ({ ...current, rawText: event.target.value }))}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {stepIndex === 2 ? (
              <div className="space-y-4">
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">{t("gen.pages.drama.DramaWorkspacePage.gen_0848477e")}</span>
                  <input
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">{t("gen.pages.drama.DramaWorkspacePage.gen_79c58c55")}</span>
                    <SelectControl
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.track}
                      onChange={(event) => setForm((current) => ({ ...current, track: event.target.value }))}
                    >
                      {DRAMA_TRACK_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </SelectControl>
                  </label>
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">{t("gen.pages.drama.DramaWorkspacePage.gen_2434d076")}</span>
                    <input
                      type="number"
                      min="1"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.targetEpisodes}
                      onChange={(event) => setForm((current) => ({ ...current, targetEpisodes: event.target.value }))}
                    />
                  </label>
                </div>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">{t("gen.pages.drama.DramaWorkspacePage.gen_27571173")}</span>
                  <input
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.theme}
                    onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))}
                  />
                </label>
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{t("gen.pages.drama.DramaWorkspacePage.gen_918cdabd")}</div>
                      <p className="text-sm text-muted-foreground">{t("gen.pages.drama.DramaWorkspacePage.gen_1befb652")}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={trackRecommendationMutation.isPending || !canRecommendTrack}
                      onClick={() => trackRecommendationMutation.mutate()}
                    >
                      <Sparkles className="h-4 w-4" />
                      {trackRecommendationMutation.isPending ? t("gen.pages.drama.DramaWorkspacePage.gen_837fbf7f") : t("gen.pages.drama.DramaWorkspacePage.gen_f64d6b4a")}
                    </Button>
                  </div>
                  {trackRecommendation ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="default">{dramaTrackLabel(trackRecommendation.recommendedTrack)}</Badge>
                        <span className="text-muted-foreground">{trackRecommendation.reason}</span>
                      </div>
                      {trackRecommendation.fitSignals.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {trackRecommendation.fitSignals.map((signal) => (
                            <Badge key={signal} variant="secondary">{signal}</Badge>
                          ))}
                        </div>
                      ) : null}
                      {trackRecommendation.risks.length > 0 ? (
                        <div className="rounded-md border border-dashed p-2 text-muted-foreground">
                          {trackRecommendation.risks.join("；")}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {stepIndex > 0 ? (
                <Button type="button" variant="outline" onClick={() => setStepIndex((current) => Math.max(0, current - 1))}>
                  上一步
                </Button>
              ) : null}
              {stepIndex < WIZARD_STEPS.length - 1 ? (
                <Button type="button" onClick={goNext}>
                  下一步
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" disabled={createMutation.isPending} onClick={handleCreate}>
                  <Plus className="h-4 w-4" />
                  {createMutation.isPending ? t("gen.pages.drama.DramaWorkspacePage.gen_b26107b6") : t("gen.pages.drama.DramaWorkspacePage.gen_d27b9156")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-normal">{t("gen.pages.drama.DramaWorkspacePage.gen_31ecc0e6")}</h2>
              <p className="text-sm text-muted-foreground">{t("gen.pages.drama.DramaWorkspacePage.gen_a8f344e6")}</p>
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
            <div className="rounded-md border p-4 text-sm text-muted-foreground">{t("gen.pages.drama.DramaWorkspacePage.gen_c5b9ca5a")}</div>
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
                onAssemble={(item) => void runProjectAction(item, assembleDramaSourceBundle, t("gen.pages.drama.DramaWorkspacePage.gen_971fac72"))}
                onStrategy={(item) => void runProjectAction(item, generateDramaStrategy, t("gen.pages.drama.DramaWorkspacePage.gen_45be5534"))}
                onOutline={(item) => void runProjectAction(
                  item,
                  (projectId) => generateDramaOutline(projectId, { startOrder: 1, count: 12 }),
                  t("gen.pages.drama.DramaWorkspacePage.gen_b1c454f5"),
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
