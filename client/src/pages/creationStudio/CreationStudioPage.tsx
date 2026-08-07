import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type {
  CreationDirection,
  NarrativeForm,
} from "@ai-novel/shared/types/creationStudio";
import type { WritingPlatform, WritingPlatformPreference } from "@ai-novel/shared/types/writingPlatform";
import {
  confirmCreationDirection,
  getCreationStudioTask,
  interpretCreationIdea,
  regenerateCreationDirections,
} from "@/api/creationStudio";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

function normalizeTarget(form: NarrativeForm, value: number): number {
  if (form === "short_story") return Math.max(3000, Math.min(30000, Math.round(value)));
  return Math.max(50000, Math.min(3_000_000, Math.round(value)));
}

export default function CreationStudioPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const taskId = searchParams.get("taskId")?.trim() ?? "";
  const shortStoryEntry = searchParams.get("form") === "short_story";
  const [idea, setIdea] = useState("");
  const [selectedDirectionId, setSelectedDirectionId] = useState("");
  const [narrativeForm, setNarrativeForm] = useState<NarrativeForm>("short_story");
  const [targetWordCount, setTargetWordCount] = useState(8000);
  const [confirmedBaseline, setConfirmedBaseline] = useState("");
  const [initialPlatformPreference, setInitialPlatformPreference] = useState<WritingPlatformPreference>("ai_recommend");
  const [writingPlatform, setWritingPlatform] = useState<WritingPlatform>("fanqie_free");

  const taskQuery = useQuery({
    queryKey: ["creation-studio", taskId],
    queryFn: () => getCreationStudioTask(taskId),
    enabled: Boolean(taskId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "queued" || status === "running" ? 1500 : false;
    },
    retry: false,
  });
  const task = taskQuery.data?.data ?? null;
  const interpretation = task?.interpretation ?? null;

  useEffect(() => {
    if (!task) return;
    setIdea((current) => current || task.idea);
    if (!interpretation) return;
    setNarrativeForm(interpretation.recommendedNarrativeForm);
    setTargetWordCount(interpretation.recommendedTargetWordCount);
    setSelectedDirectionId((current) => current || interpretation.directions[0].id);
    setWritingPlatform(interpretation.recommendedWritingPlatform);
    setConfirmedBaseline(`${interpretation.recommendedNarrativeForm}:${interpretation.recommendedTargetWordCount}:${interpretation.recommendedWritingPlatform}`);
  }, [task?.taskId, interpretation]);

  const currentScaleKey = `${narrativeForm}:${targetWordCount}:${writingPlatform}`;
  const scaleNeedsRefresh = Boolean(interpretation && confirmedBaseline && currentScaleKey !== confirmedBaseline);
  const selectedDirection = useMemo(
    () => interpretation?.directions.find((direction) => direction.id === selectedDirectionId) ?? null,
    [interpretation, selectedDirectionId],
  );

  const interpretMutation = useMutation({
    mutationFn: () => interpretCreationIdea({
      idea: idea.trim(),
      preferredNarrativeForm: shortStoryEntry ? "short_story" : undefined,
      writingPlatformPreference: initialPlatformPreference,
    }),
    onSuccess: (response) => {
      const created = response.data;
      if (!created) return;
      setSearchParams({ taskId: created.taskId }, { replace: true });
      toast.success("AI 已整理好两个可选方向。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "暂时无法理解这个想法，请重试。"),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateCreationDirections(taskId, {
      narrativeForm,
      targetWordCount: normalizeTarget(narrativeForm, targetWordCount),
      writingPlatformPreference: writingPlatform,
      feedback: "请按我调整后的作品规模与目标平台重新适配两个方向。",
    }),
    onSuccess: async (response) => {
      setConfirmedBaseline(`${narrativeForm}:${normalizeTarget(narrativeForm, targetWordCount)}:${writingPlatform}`);
      setSelectedDirectionId(response.data?.interpretation?.directions[0].id ?? "");
      await queryClient.invalidateQueries({ queryKey: ["creation-studio", taskId] });
      toast.success("方向已按新的作品规模更新。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新方向失败。"),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!selectedDirection) throw new Error("请先选择一个方向。");
      return confirmCreationDirection(taskId, {
        directionId: selectedDirection.id,
        narrativeForm,
        targetWordCount: normalizeTarget(narrativeForm, targetWordCount),
        idempotencyKey: `creation:${taskId}:${selectedDirection.id}`,
        writingPlatform,
      });
    },
    onSuccess: (response) => {
      if (response.data?.resumeRoute) navigate(response.data.resumeRoute);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "开始创作失败。"),
  });

  if (taskId && taskQuery.isLoading) {
    return <CenteredStatus label="正在恢复你的创作想法…" />;
  }

  return (
    <div className="w-full space-y-10 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground hover:text-foreground">
          <Link to="/novels"><ArrowLeft className="mr-2 h-4 w-4" />返回作品列表</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <Link to="/novels/create">
            完整设置
            <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <section className="w-full pt-3 sm:pt-8">
        <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
          {shortStoryEntry ? "短篇创作 · 3,000—30,000 字" : "AI 创作工作室"}
        </div>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-foreground sm:text-5xl lg:text-[3.5rem]">
          {shortStoryEntry ? "从一个念头，抵达完整短篇" : "从一个念头，抵达完整作品"}
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
          {shortStoryEntry
            ? "写下一段画面、一个人物，或者某种很想表达的情绪。AI 会把它整理成两个清晰方向，确认后直接写成完整作品。"
            : "不必先理解结构和规划。写下最想表达的部分，AI 会整理作品规模和两个清晰方向。"}
        </p>
      </section>

      {!interpretation ? (
        <section
          aria-labelledby="creation-idea-heading"
          className="mx-auto w-full max-w-4xl rounded-2xl bg-muted/20 p-3 shadow-[0_14px_44px_rgba(15,23,42,0.06)] transition focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/30 sm:p-4"
        >
          <div className="flex items-start justify-between gap-4 px-1 pt-1">
            <div>
              <div className="text-xs font-medium text-muted-foreground">01 · 起点</div>
              <h2 id="creation-idea-heading" className="mt-2 text-xl font-semibold tracking-[-0.02em]">
                故事从哪里开始？
              </h2>
            </div>
            {idea ? (
              <span className="pt-1 text-xs tabular-nums text-muted-foreground">
                {idea.length.toLocaleString()} / 12,000
              </span>
            ) : null}
          </div>
          <textarea
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder="例如：一个总能听见谎言的女孩，遇见了唯一无法判断真假的人……"
            aria-label={shortStoryEntry ? "写下短篇故事想法" : "写下故事想法"}
            className="mt-5 min-h-[180px] w-full resize-none bg-transparent px-1 py-1 text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground/60 sm:text-lg sm:leading-8"
            maxLength={12000}
            autoFocus
          />
          <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span className="shrink-0">目标平台</span>
              <Select
                value={initialPlatformPreference}
                onValueChange={(value) => setInitialPlatformPreference(value as WritingPlatformPreference)}
              >
                <SelectTrigger aria-label="选择目标平台" className="h-9 min-w-[11rem] rounded-md px-2.5 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai_recommend">让 AI 推荐</SelectItem>
                  <SelectItem value="fanqie_free">番茄免费网文</SelectItem>
                  {!shortStoryEntry ? <SelectItem value="qidian_male">起点男频</SelectItem> : null}
                  {!shortStoryEntry ? <SelectItem value="jinjiang_female">晋江女频</SelectItem> : null}
                  <SelectItem value="zhihu_story">知乎短故事</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-xs leading-5 text-muted-foreground">人物、画面、冲突，写下任何一个就够了。</span>
              <Button
                size="lg"
                className="h-11 rounded-full px-6 shadow-none"
                onClick={() => interpretMutation.mutate()}
                disabled={!idea.trim() || interpretMutation.isPending}
              >
                {interpretMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                生成创作方向
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-6">
          <Card className="border-border/70 bg-muted/20">
            <CardContent className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_18rem]">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-primary">AI 对作品的理解</div>
                <p className="mt-2 text-sm leading-7 text-foreground">{interpretation.understanding}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{interpretation.recommendationReason}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">平台建议：{interpretation.writingPlatformReason}</p>
                {interpretation.productionFoundation ? (
                  <div className="mt-4 border-t border-border/60 pt-3">
                    <div className="text-xs text-muted-foreground">AI 建议的创作底座</div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {interpretation.productionFoundation.genre.path}
                      <span className="mx-2 text-muted-foreground">×</span>
                      {interpretation.productionFoundation.primaryStoryMode.path}
                      {interpretation.productionFoundation.secondaryStoryMode
                        ? ` + ${interpretation.productionFoundation.secondaryStoryMode.path}`
                        : ""}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {interpretation.productionFoundation.summary}
                    </p>
                  </div>
                ) : null}
              </div>
              <ScaleControls
                narrativeForm={narrativeForm}
                targetWordCount={targetWordCount}
                onFormChange={(form) => {
                  setNarrativeForm(form);
                  setTargetWordCount(form === "short_story" ? 8000 : 200000);
                  setWritingPlatform("fanqie_free");
                }}
                onTargetChange={setTargetWordCount}
                writingPlatform={writingPlatform}
                onPlatformChange={setWritingPlatform}
              />
            </CardContent>
          </Card>

          {scaleNeedsRefresh ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50/50 px-4 py-3 dark:bg-amber-950/10">
              <p className="text-sm text-muted-foreground">作品规模或目标平台变了，先让 AI 重新适配方向。</p>
              <Button
                variant="outline"
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", regenerateMutation.isPending && "animate-spin")} />
                按新规模更新方向
              </Button>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {interpretation.directions.map((direction) => (
              <DirectionCard
                key={direction.id}
                direction={direction}
                selected={direction.id === selectedDirectionId}
                onSelect={() => setSelectedDirectionId(direction.id)}
              />
            ))}
          </div>

          <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">{selectedDirection ? `将以《${selectedDirection.title}》开始` : "请选择一个方向"}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {narrativeForm === "short_story" ? "会直接生成一篇连续完整的短篇作品。" : "会交给长篇自动导演继续完成整书准备。"}
              </div>
            </div>
            <Button
              size="lg"
              onClick={() => confirmMutation.mutate()}
              disabled={!selectedDirection || scaleNeedsRefresh || confirmMutation.isPending}
            >
              {confirmMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              确认这个方向并开始
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectionCard(props: {
  direction: CreationDirection;
  selected: boolean;
  onSelect: () => void;
}) {
  const direction = props.direction;
  return (
    <button type="button" className="h-full text-left" onClick={props.onSelect} aria-pressed={props.selected}>
      <Card className={cn(
        "h-full transition hover:border-primary/50 hover:shadow-sm",
        props.selected && "border-primary ring-2 ring-primary/15",
      )}>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-semibold">{direction.title}</h2>
            <span className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
              props.selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}>
              {props.selected ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
          </div>
          <p className="text-sm leading-7 text-foreground">{direction.premise}</p>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <DirectionFact label="核心体验" value={direction.coreExperience} />
            <DirectionFact label="主角" value={direction.protagonist} />
            <DirectionFact label="主要冲突" value={direction.centralConflict} />
            <DirectionFact label="结尾回报" value={direction.endingPromise} />
          </div>
          <div className="flex flex-wrap gap-2">
            {direction.styleKeywords.map((keyword) => (
              <span key={keyword} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{keyword}</span>
            ))}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function DirectionFact(props: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 leading-6">{props.value}</div>
    </div>
  );
}

function ScaleControls(props: {
  narrativeForm: NarrativeForm;
  targetWordCount: number;
  onFormChange: (value: NarrativeForm) => void;
  onTargetChange: (value: number) => void;
  writingPlatform: WritingPlatform;
  onPlatformChange: (value: WritingPlatform) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border bg-background p-4">
      <div className="text-xs font-medium text-muted-foreground">作品规模</div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={props.narrativeForm === "short_story" ? "default" : "outline"}
          onClick={() => props.onFormChange("short_story")}
        >
          短篇
        </Button>
        <Button
          type="button"
          size="sm"
          variant={props.narrativeForm === "long_novel" ? "default" : "outline"}
          onClick={() => props.onFormChange("long_novel")}
        >
          长篇
        </Button>
      </div>
      <label className="block">
        <span className="text-xs text-muted-foreground">目标字数</span>
        <Input
          className="mt-1"
          type="number"
          min={props.narrativeForm === "short_story" ? 3000 : 30001}
          max={props.narrativeForm === "short_story" ? 30000 : 3000000}
          step={1000}
          value={props.targetWordCount}
          onChange={(event) => props.onTargetChange(Number(event.target.value))}
        />
      </label>
      <div className="block">
        <span className="text-xs text-muted-foreground">目标平台</span>
        <Select
          value={props.writingPlatform}
          onValueChange={(value) => props.onPlatformChange(value as WritingPlatform)}
        >
          <SelectTrigger className="mt-1 h-10 rounded-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fanqie_free">番茄免费网文</SelectItem>
            {props.narrativeForm === "long_novel" ? <SelectItem value="qidian_male">起点男频</SelectItem> : null}
            {props.narrativeForm === "long_novel" ? <SelectItem value="jinjiang_female">晋江女频</SelectItem> : null}
            {props.narrativeForm === "short_story" ? <SelectItem value="zhihu_story">知乎短故事</SelectItem> : null}
          </SelectContent>
        </Select>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">AI 会按平台调整开篇、推进、回报和语言读感。</p>
      </div>
    </div>
  );
}

function CenteredStatus({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}
