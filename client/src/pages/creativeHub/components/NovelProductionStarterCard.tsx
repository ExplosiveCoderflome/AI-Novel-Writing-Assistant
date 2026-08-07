import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CreativeHubProductionStatus } from "@ai-novel/shared/types/creativeHub";
import { RefreshCw } from "lucide-react";
import { getNovelDetail, updateNovel } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { WorkspaceStateNotice } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import SelectControl from "@/components/common/SelectControl";

interface NovelProductionStarterCardProps {
  currentNovelTitle?: string | null;
  currentNovelId?: string | null;
  productionStatus?: CreativeHubProductionStatus | null;
  actionDisabled?: boolean;
  onSubmit: (prompt: string) => void | Promise<void>;
  onQuickAction?: (prompt: string) => void;
}

function ProductionField(props: {
  htmlFor: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={props.htmlFor} className="block text-xs font-medium text-foreground">
        {props.label}
      </label>
      {props.children}
      {props.hint ? <p className="text-xs leading-5 text-muted-foreground">{props.hint}</p> : null}
    </div>
  );
}

function fromNarrativePov(value: "first_person" | "third_person" | "mixed" | null | undefined): string {
  if (value === "first_person") return "first person";
  if (value === "third_person") return "third person";
  if (value === "mixed") return "mixed perspective";
  return "";
}

function toNarrativePov(value: string): "first_person" | "third_person" | "mixed" | null {
  if (value === "first person") return "first_person";
  if (value === "third person") return "third_person";
  if (value === "mixed perspective") return "mixed";
  return null;
}

function fromPacePreference(value: "slow" | "balanced" | "fast" | null | undefined): string {
  if (value === "slow") return "slow pace";
  if (value === "balanced") return "balanced rhythm";
  if (value === "fast") return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  return "";
}

function toPacePreference(value: string): "slow" | "balanced" | "fast" | null {
  if (value === "slow pace") return "slow";
  if (value === "balanced rhythm") return "balanced";
  if (value === "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.") return "fast";
  return null;
}

function fromProjectMode(value: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline" | null | undefined): string {
  if (value === "ai_led") return "AI-driven";
  if (value === "co_pilot") return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  if (value === "draft_mode") return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  if (value === "auto_pipeline") return "Automatic assembly line";
  return "";
}

function toProjectMode(value: string): "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline" | null {
  if (value === "AI-driven") return "ai_led";
  if (value === "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.") return "co_pilot";
  if (value === "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.") return "draft_mode";
  if (value === "Automatic assembly line") return "auto_pipeline";
  return null;
}

function fromLevel(value: "low" | "medium" | "high" | null | undefined): string {
  if (value === "low") return "Low";
  if (value === "medium") return "middle";
  if (value === "high") return "high";
  return "";
}

function toLevel(value: string): "low" | "medium" | "high" | null {
  if (value === "Low") return "low";
  if (value === "middle") return "medium";
  if (value === "high") return "high";
  return null;
}

function buildProductionPrompt(input: {
  currentNovelId?: string | null;
  title: string;
  description: string;
  targetChapterCount: number;
  genre: string;
  styleTone: string;
  narrativePov: string;
  pacePreference: string;
  projectMode: string;
  emotionIntensity: string;
  aiFreedom: string;
  defaultChapterLength: number;
  worldType: string;
}) {
  const description = input.description.trim();
  const genre = input.genre.trim();
  const styleTone = input.styleTone.trim();
  const narrativePov = input.narrativePov.trim();
  const pacePreference = input.pacePreference.trim();
  const projectMode = input.projectMode.trim();
  const emotionIntensity = input.emotionIntensity.trim();
  const aiFreedom = input.aiFreedom.trim();
  const defaultChapterLength = Math.max(500, Math.min(10000, Math.floor(input.defaultChapterLength || 2500)));
  const worldType = input.worldType.trim();
  const targetChapterCount = Math.max(1, Math.min(200, Math.floor(input.targetChapterCount || 20)));
  if (input.currentNovelId) {
    const segments = [`继续生成当前小说。目标章节数：${targetChapterCount}。`];
    if (description) {
      segments.push(`补充设定：${description}。`);
    }
    if (genre) {
      segments.push(`题材偏好：${genre}。`);
    }
    if (styleTone) {
      segments.push(`风格基调：${styleTone}。`);
    }
    if (narrativePov) {
      segments.push(`叙事视角：${narrativePov}。`);
    }
    if (pacePreference) {
      segments.push(`推进节奏：${pacePreference}。`);
    }
    if (projectMode) {
      segments.push(`协作模式：${projectMode}。`);
    }
    if (emotionIntensity) {
      segments.push(`情绪强度：${emotionIntensity}。`);
    }
    if (aiFreedom) {
      segments.push(`AI freedom：${aiFreedom}。`);
    }
    if (defaultChapterLength) {
      segments.push(`默认章长：约 ${defaultChapterLength} 字。`);
    }
    if (worldType) {
      segments.push(`世界观类型偏好：${worldType}。`);
    }
    return segments.join("");
  }
  const title = input.title.trim();
  const segments = [`创建一本${targetChapterCount}章小说《${title}》，并开始整本生成。`];
  if (description) {
    segments.push(`简介：${description}。`);
  }
  if (genre) {
    segments.push(`题材：${genre}。`);
  }
  if (styleTone) {
    segments.push(`风格基调：${styleTone}。`);
  }
  if (narrativePov) {
    segments.push(`叙事视角：${narrativePov}。`);
  }
  if (pacePreference) {
    segments.push(`推进节奏：${pacePreference}。`);
  }
  if (projectMode) {
    segments.push(`协作模式：${projectMode}。`);
  }
  if (emotionIntensity) {
    segments.push(`情绪强度：${emotionIntensity}。`);
  }
  if (aiFreedom) {
    segments.push(`AI freedom：${aiFreedom}。`);
  }
  if (defaultChapterLength) {
    segments.push(`默认章长：约 ${defaultChapterLength} 字。`);
  }
  if (worldType) {
    segments.push(`世界观类型：${worldType}。`);
  }
  return segments.join("");
}

export default function NovelProductionStarterCard({
  currentNovelTitle,
  currentNovelId,
  productionStatus,
  actionDisabled = false,
  onSubmit,
  onQuickAction,
}: NovelProductionStarterCardProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetChapterCount, setTargetChapterCount] = useState(20);
  const [genre, setGenre] = useState("");
  const [styleTone, setStyleTone] = useState("");
  const [narrativePov, setNarrativePov] = useState("");
  const [pacePreference, setPacePreference] = useState("");
  const [projectMode, setProjectMode] = useState("");
  const [emotionIntensity, setEmotionIntensity] = useState("");
  const [aiFreedom, setAiFreedom] = useState("");
  const [defaultChapterLength, setDefaultChapterLength] = useState(2500);
  const [worldType, setWorldType] = useState("");
  const submitInFlightRef = useRef(false);

  const novelDetailQuery = useQuery({
    queryKey: queryKeys.novels.detail(currentNovelId || "none"),
    queryFn: () => getNovelDetail(currentNovelId!),
    enabled: Boolean(currentNovelId),
    retry: false,
  });

  useEffect(() => {
    setTitle("");
    setDescription("");
    setTargetChapterCount(20);
    setGenre("");
    setStyleTone("");
    setNarrativePov("");
    setPacePreference("");
    setProjectMode("");
    setEmotionIntensity("");
    setAiFreedom("");
    setDefaultChapterLength(2500);
    setWorldType("");
  }, [currentNovelId]);

  useEffect(() => {
    if (productionStatus?.targetChapterCount) {
      setTargetChapterCount(productionStatus.targetChapterCount);
    }
  }, [productionStatus?.targetChapterCount]);

  useEffect(() => {
    const novel = novelDetailQuery.data?.data;
    if (!currentNovelId || !novel) {
      return;
    }
    setDescription(novel.description ?? "");
    setGenre(novel.genre?.name ?? "");
    setStyleTone(novel.styleTone ?? "");
    setNarrativePov(fromNarrativePov(novel.narrativePov));
    setPacePreference(fromPacePreference(novel.pacePreference));
    setProjectMode(fromProjectMode(novel.projectMode));
    setEmotionIntensity(fromLevel(novel.emotionIntensity));
    setAiFreedom(fromLevel(novel.aiFreedom));
    setDefaultChapterLength(novel.defaultChapterLength ?? 2500);
  }, [currentNovelId, novelDetailQuery.data]);

  const resolvedTitle = currentNovelTitle?.trim() || "";
  const isContinueMode = Boolean(currentNovelId);
  const detailErrorMessage = novelDetailQuery.error instanceof Error
    ? novelDetailQuery.error.message
    : isContinueMode && novelDetailQuery.isSuccess && !novelDetailQuery.data?.data
      ? "The production settings for the current novel were not read."
      : "";
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (currentNovelId) {
        await updateNovel(currentNovelId, {
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(styleTone.trim() ? { styleTone: styleTone.trim() } : {}),
          ...(toNarrativePov(narrativePov) ? { narrativePov: toNarrativePov(narrativePov) } : {}),
          ...(toPacePreference(pacePreference) ? { pacePreference: toPacePreference(pacePreference) } : {}),
          ...(toProjectMode(projectMode) ? { projectMode: toProjectMode(projectMode) } : {}),
          ...(toLevel(emotionIntensity) ? { emotionIntensity: toLevel(emotionIntensity) } : {}),
          ...(toLevel(aiFreedom) ? { aiFreedom: toLevel(aiFreedom) } : {}),
          ...(defaultChapterLength
            ? { defaultChapterLength: Math.max(500, Math.min(10000, defaultChapterLength)) }
            : {}),
        });
      }
      await onSubmit(buildProductionPrompt({
        currentNovelId,
        title,
        description,
        targetChapterCount,
        genre,
        styleTone,
        narrativePov,
        pacePreference,
        projectMode,
        emotionIntensity,
        aiFreedom,
        defaultChapterLength,
        worldType,
      }));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The entire production startup failed.");
    },
  });
  const formDisabled = actionDisabled
    || novelDetailQuery.isFetching
    || Boolean(detailErrorMessage)
    || submitMutation.isPending;
  const submitDisabled = formDisabled || (!isContinueMode && !title.trim());
  const fieldClassName = "w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 md:text-sm";
  const startProduction = () => {
    if (submitInFlightRef.current) {
      return;
    }
    submitInFlightRef.current = true;
    submitMutation.mutate(undefined, {
      onSettled: () => {
        submitInFlightRef.current = false;
      },
    });
  };

  return (
    <div className="space-y-3" aria-busy={novelDetailQuery.isFetching || submitMutation.isPending}>
      <div className="text-xs font-medium text-muted-foreground">Entire production</div>
      <div className="space-y-3">
        <div className="rounded-md border border-info/25 bg-info/5 px-3 py-2 text-xs text-muted-foreground">
          {isContinueMode
            ? `当前将继续生产《${resolvedTitle || "current novel"}》。`
            : "Currently in global mode, you can directly create a new book and start the entire production."}
        </div>
        <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
          It is recommended to confirm first: subject matter, style, perspective, rhythm, chapter length, and AI freedom. The more complete the conditions, the smaller the overall production deviation.
                          </div>

        {novelDetailQuery.isFetching ? (
          <WorkspaceStateNotice
            compact
            loading
            tone="info"
            title="Loading novel settings"
            description="The entire production will not be committed until the read is complete to avoid overwriting the current novel with empty settings."
          />
        ) : detailErrorMessage ? (
          <WorkspaceStateNotice
            compact
            tone="danger"
            title="Failed to read novel settings"
            description={`${detailErrorMessage} 请重新读取后再启动整本生产。`}
            action={(
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={novelDetailQuery.isFetching}
                onClick={() => void novelDetailQuery.refetch()}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {novelDetailQuery.isFetching ? "Trying again..." : "reread"}
              </Button>
            )}
          />
        ) : null}

        {!isContinueMode ? (
          <ProductionField
            htmlFor="creative-hub-production-title"
            label="Novel title"
            hint="Required when creating a new novel."
          >
            <input
              id="creative-hub-production-title"
              className={fieldClassName}
              placeholder="For example: Night Light Watcher"
              value={title}
              disabled={formDisabled}
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </ProductionField>
        ) : null}

        <ProductionField htmlFor="creative-hub-production-description" label="Introduction and core settings">
          <textarea
            id="creative-hub-production-description"
            className={`${fieldClassName} min-h-[88px] resize-y`}
            placeholder="Summarize the protagonist's situation, core conflict, and the experience that this book most wants to fulfill."
            value={description}
            disabled={formDisabled}
            onChange={(event) => setDescription(event.target.value)}
          />
        </ProductionField>

        <div className="grid gap-2 sm:grid-cols-2">
          <ProductionField htmlFor="creative-hub-production-genre" label="Subject type">
            <input
              id="creative-hub-production-genre"
              className={fieldClassName}
              placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
              value={genre}
              disabled={formDisabled}
              onChange={(event) => setGenre(event.target.value)}
            />
          </ProductionField>
          <ProductionField htmlFor="creative-hub-production-style" label="style tone">
            <input
              id="creative-hub-production-style"
              className={fieldClassName}
              placeholder="For example: brisk and passionate"
              value={styleTone}
              disabled={formDisabled}
              onChange={(event) => setStyleTone(event.target.value)}
            />
          </ProductionField>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <ProductionField htmlFor="creative-hub-production-pov" label="narrative perspective">
            <SelectControl
              id="creative-hub-production-pov"
              className={fieldClassName}
              value={narrativePov}
              disabled={formDisabled}
              onChange={(event) => setNarrativePov(event.target.value)}
            >
              <option value="">Leave it to AI judgment</option>
              <option value="first person">first person</option>
              <option value="third person">third person</option>
              <option value="mixed perspective">mixed perspective</option>
            </SelectControl>
          </ProductionField>
          <ProductionField htmlFor="creative-hub-production-pace" label="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.">
            <SelectControl
              id="creative-hub-production-pace"
              className={fieldClassName}
              value={pacePreference}
              disabled={formDisabled}
              onChange={(event) => setPacePreference(event.target.value)}
            >
              <option value="">Leave it to AI judgment</option>
              <option value="slow pace">slow pace</option>
              <option value="balanced rhythm">balanced rhythm</option>
              <option value="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
            </SelectControl>
          </ProductionField>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <ProductionField htmlFor="creative-hub-production-mode" label="Collaboration mode">
            <SelectControl
              id="creative-hub-production-mode"
              className={fieldClassName}
              value={projectMode}
              disabled={formDisabled}
              onChange={(event) => setProjectMode(event.target.value)}
            >
              <option value="">Use novel defaults</option>
              <option value="AI-driven">AI-driven</option>
              <option value="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
              <option value="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
              <option value="Automatic assembly line">Automatic assembly line</option>
            </SelectControl>
          </ProductionField>
          <ProductionField htmlFor="creative-hub-production-emotion" label="emotional intensity">
            <SelectControl
              id="creative-hub-production-emotion"
              className={fieldClassName}
              value={emotionIntensity}
              disabled={formDisabled}
              onChange={(event) => setEmotionIntensity(event.target.value)}
            >
              <option value="">Use novel defaults</option>
              <option value="Low">Low</option>
              <option value="middle">middle</option>
              <option value="high">high</option>
            </SelectControl>
          </ProductionField>
          <ProductionField htmlFor="creative-hub-production-freedom" label="AI freedom">
            <SelectControl
              id="creative-hub-production-freedom"
              className={fieldClassName}
              value={aiFreedom}
              disabled={formDisabled}
              onChange={(event) => setAiFreedom(event.target.value)}
            >
              <option value="">Use novel defaults</option>
              <option value="Low">Low</option>
              <option value="middle">middle</option>
              <option value="high">high</option>
            </SelectControl>
          </ProductionField>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <ProductionField htmlFor="creative-hub-production-chapters" label="Target number of chapters">
            <input
              id="creative-hub-production-chapters"
              className={fieldClassName}
              type="number"
              min={1}
              max={200}
              value={targetChapterCount}
              disabled={formDisabled}
              onChange={(event) => setTargetChapterCount(Number(event.target.value || 20))}
            />
          </ProductionField>
          <ProductionField htmlFor="creative-hub-production-length" label="Default chapter length (words)">
            <input
              id="creative-hub-production-length"
              className={fieldClassName}
              type="number"
              min={500}
              max={10000}
              value={defaultChapterLength}
              disabled={formDisabled}
              onChange={(event) => setDefaultChapterLength(Number(event.target.value || 2500))}
            />
          </ProductionField>
          <ProductionField htmlFor="creative-hub-production-world" label="Worldview type (optional)">
            <input
              id="creative-hub-production-world"
              className={fieldClassName}
              placeholder="For example: Doomsday Wasteland"
              value={worldType}
              disabled={formDisabled}
              onChange={(event) => setWorldType(event.target.value)}
            />
          </ProductionField>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={submitDisabled}
            onClick={startProduction}
          >
            {submitMutation.isPending ? "Starting..." : isContinueMode ? "Continuing full book production" : "Starting full book production"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={formDisabled}
            onClick={() => onQuickAction?.("Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.")}
          >
            Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                                </Button>
          <Button
            type="button"
            variant="outline"
            disabled={formDisabled}
            onClick={() => onQuickAction?.("Why does the entire build not start?")}
          >
            View blocking
                                </Button>
          <Button
            type="button"
            variant="outline"
            disabled={formDisabled}
            onClick={() => onQuickAction?.("Based on the current novel information, give 3 alternative answers each for pre-production theme, style, perspective, pacing, chapter length, and AI freedom.")}
          >
            Generate alternatives
                                </Button>
        </div>
      </div>
    </div>
  );
}
