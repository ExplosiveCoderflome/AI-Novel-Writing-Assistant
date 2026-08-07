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
  { key: "source", label: "source" },
  { key: "content", label: "content" },
  { key: "settings", label: "Specification" },
] as const;

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Material preparation",
    strategized: "Policy has been generated",
    outlined: "Episode has been generated",
    scripting: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    completed: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
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
    return `已选择小说《${selectedNovel.title || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}》，共 ${selectedNovel._count?.chapters ?? 0} 章。`;
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
            {dramaTrackLabel(props.project.track)} · {props.project.targetEpisodes} set
                                </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild type="button" size="sm">
          <Link to={`/drama/projects/${props.project.id}`}>
            Open workbench
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
          Organize materials
                          </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() => props.onStrategy(props.project)}
        >
          <Sparkles className="h-4 w-4" />
          Generate strategy
                          </Button>
        <Button
          type="button"
          size="sm"
          disabled={isBusy}
          onClick={() => props.onOutline(props.project)}
        >
          <ListVideo className="h-4 w-4" />
          Generating first 12 episodes
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
      toast.success("Skit project created.");
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
      title: form.title.trim() || selectedNovel?.title || "Short play project",
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
        toast.success("Suitable skit tracks have been recommended.");
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
        toast.error("Please select a novel to adapt.");
        return false;
      }
      if (form.source === "original" && !form.inspiration.trim()) {
        toast.error("Please fill in original inspiration.");
        return false;
      }
      if (form.source === "text_import" && !form.rawText.trim()) {
        toast.error("Please paste the text you want to organize.");
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
      toast.error("Please fill in the short play project name first.");
      return;
    }
    if (form.source === "novel_import" && !form.sourceRef.trim()) {
      toast.error("Please select a novel to adapt.");
      return;
    }
    if (form.source === "original" && !form.inspiration.trim()) {
      toast.error("Please fill in original inspiration.");
      return;
    }
    if (form.source === "text_import" && !form.rawText.trim()) {
      toast.error("Please paste the text you want to organize.");
      return;
    }
    createMutation.mutate(buildCreatePayload(form));
  };

  const chooseSource = (source: DramaSourceType) => {
    setForm((current) => ({
      ...current,
      source,
      sourceRef: "",
      title: source === "original" && !current.title ? "Original short drama project" : current.title,
    }));
    setTrackRecommendation(null);
    setStepIndex(1);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-normal">Short drama workbench</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Organize short play materials from novels, original inspirations or imported texts, and generate vertical screen paid short play strategies and episode scripts.
                          </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">New short drama project</CardTitle>
            <CardDescription>Follow the steps to select sources, supplement content, and create projects that can enter the short drama production line.</CardDescription>
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
                  <div className="flex items-center gap-2 font-medium"><BookOpenText className="h-4 w-4" />Import novels</div>
                  <p className="mt-1 text-sm text-muted-foreground">Adapted from an existing novel, it is suitable for converting an existing novel into a short vertical screen play.</p>
                </button>
                <button type="button" className={`rounded-lg border p-3 text-left ${form.source === "original" ? "border-primary bg-primary/5" : ""}`} onClick={() => chooseSource("original")}>
                  <div className="flex items-center gap-2 font-medium"><Lightbulb className="h-4 w-4" />Original short play</div>
                  <p className="mt-1 text-sm text-muted-foreground">Start with an inspiration and systematically organize characters, conflicts, and beats.</p>
                </button>
                <button type="button" className={`rounded-lg border p-3 text-left ${form.source === "text_import" ? "border-primary bg-primary/5" : ""}`} onClick={() => chooseSource("text_import")}>
                  <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4" />Paste text</div>
                  <p className="mt-1 text-sm text-muted-foreground">Organize external story synopses, short stories, or material texts into short play projects.</p>
                </button>
              </div>
            ) : null}

            {stepIndex === 1 ? (
              <div className="space-y-4">
                {form.source === "novel_import" ? (
                  <>
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</span>
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
                          {novelsQuery.isLoading ? "Loading novel..." : novels.length > 0 ? "Please select the novel you want to adapt" : "No novels available yet"}
                        </option>
                        {novels.map((novel) => (
                          <option key={novel.id} value={novel.id}>
                            {novel.title || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}（{novel._count.chapters} chapter)
                                                          </option>
                        ))}
                      </SelectControl>
                    </label>
                    {selectedNovel ? (
                      <div className="rounded-md border p-3 text-sm text-muted-foreground">
                        Selected {selectedNovel.title || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."},common {selectedNovel._count.chapters} chapter. After creation, it will be organized into short play material packages.
                                                                    </div>
                    ) : null}
                  </>
                ) : null}

                {form.source === "original" ? (
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">Original inspiration</span>
                    <textarea
                      className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={form.inspiration}
                      placeholder="For example: the heroine whose engagement was broken off discovered that she was actually the heir of a chaebol, and fought back in public against all those who humiliated her."
                      onChange={(event) => setForm((current) => ({ ...current, inspiration: event.target.value }))}
                    />
                  </label>
                ) : null}

                {form.source === "text_import" ? (
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">Import text</span>
                    <textarea
                      className="min-h-40 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={form.rawText}
                      placeholder="Paste the story outline, character settings, short text or adapted materials."
                      onChange={(event) => setForm((current) => ({ ...current, rawText: event.target.value }))}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {stepIndex === 2 ? (
              <div className="space-y-4">
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">Project name</span>
                  <input
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">Track</span>
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
                    <span className="font-medium">Number of target sets</span>
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
                  <span className="font-medium">Theme supplement</span>
                  <input
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.theme}
                    onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))}
                  />
                </label>
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">Track recommendations</div>
                      <p className="text-sm text-muted-foreground">Recommend a more suitable vertical screen short drama track based on the current material.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={trackRecommendationMutation.isPending || !canRecommendTrack}
                      onClick={() => trackRecommendationMutation.mutate()}
                    >
                      <Sparkles className="h-4 w-4" />
                      {trackRecommendationMutation.isPending ? "Recommending..." : "Recommended track"}
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
                  Previous step
                                                  </Button>
              ) : null}
              {stepIndex < WIZARD_STEPS.length - 1 ? (
                <Button type="button" onClick={goNext}>
                  Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                                                    <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" disabled={createMutation.isPending} onClick={handleCreate}>
                  <Plus className="h-4 w-4" />
                  {createMutation.isPending ? "Creating..." : "Create a skit project"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-normal">Project</h2>
              <p className="text-sm text-muted-foreground">Organize the materials first, then generate strategies and episodes.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={projectsQuery.isFetching}
              onClick={() => void projectsQuery.refetch()}
            >
              <RefreshCw className="h-4 w-4" />
              refresh
                                      </Button>
          </div>

          {projectsQuery.isLoading ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading short drama project...</div>
          ) : null}

          {!projectsQuery.isLoading && projects.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              There are no short drama projects yet. Start by creating a project on the left.
                                      </div>
          ) : null}

          <div className="grid gap-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                busyProjectId={busyProjectId}
                onAssemble={(item) => void runProjectAction(item, assembleDramaSourceBundle, "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.")}
                onStrategy={(item) => void runProjectAction(item, generateDramaStrategy, "Skit strategy generated.")}
                onOutline={(item) => void runProjectAction(
                  item,
                  (projectId) => generateDramaOutline(projectId, { startOrder: 1, count: 12 }),
                  "The first 12 episodes have been produced.",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
