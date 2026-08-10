import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
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
  if (value === "first_person") return i18next.t("dict.gen_f69e8c5f");
  if (value === "third_person") return i18next.t("dict.gen_5eff3cab");
  if (value === "mixed") return i18next.t("dict.gen_73b444ba");
  return "";
}

function toNarrativePov(value: string): "first_person" | "third_person" | "mixed" | null {
  if (value === "第一人称") return "first_person";
  if (value === "第三人称") return "third_person";
  if (value === "混合视角") return "mixed";
  return null;
}

function fromPacePreference(value: "slow" | "balanced" | "fast" | null | undefined): string {
  if (value === "slow") return i18next.t("dict.gen_7209da38");
  if (value === "balanced") return i18next.t("creativeHub.novelProductionStarterCard.bkwd53");
  if (value === "fast") return i18next.t("dict.gen_de82b2fd");
  return "";
}

function toPacePreference(value: string): "slow" | "balanced" | "fast" | null {
  if (value === "慢节奏") return "slow";
  if (value === "均衡节奏") return "balanced";
  if (value === "快节奏") return "fast";
  return null;
}

function fromProjectMode(value: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline" | null | undefined): string {
  if (value === "ai_led") return i18next.t("creativeHub.novelProductionStarterCard.11fpjt");
  if (value === "co_pilot") return i18next.t("creativeHub.novelProductionStarterCard.aczqnh");
  if (value === "draft_mode") return i18next.t("creativeHub.novelProductionStarterCard.h2eo5i");
  if (value === "auto_pipeline") return i18next.t("creativeHub.novelProductionStarterCard.lmnhou");
  return "";
}

function toProjectMode(value: string): "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline" | null {
  if (value === "AI 主导") return "ai_led";
  if (value === "人机协作") return "co_pilot";
  if (value === "草稿优先") return "draft_mode";
  if (value === "自动流水线") return "auto_pipeline";
  return null;
}

function fromLevel(value: "low" | "medium" | "high" | null | undefined): string {
  if (value === "low") return i18next.t("dict.low");
  if (value === "medium") return i18next.t("dict.mid");
  if (value === "high") return i18next.t("dict.gen_4296d7d2");
  return "";
}

function toLevel(value: string): "low" | "medium" | "high" | null {
  if (value === "低") return "low";
  if (value === "中") return "medium";
  if (value === "高") return "high";
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
      segments.push(`AI 自由度：${aiFreedom}。`);
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
    segments.push(`AI 自由度：${aiFreedom}。`);
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
  const { t } = useTranslation();
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
      ? "没有读取到当前小说的生产设置。"
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
      toast.error(error instanceof Error ? error.message : i18next.t("creativeHub.novelProductionStarterCard.iso3x1"));
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
      <div className="text-xs font-medium text-muted-foreground">{i18next.t("dict.gen_080bb6bb")}</div>
      <div className="space-y-3">
        <div className="rounded-md border border-info/25 bg-info/5 px-3 py-2 text-xs text-muted-foreground">
          {isContinueMode
            ? `当前将继续生产《${resolvedTitle || "当前小说"}》。`
            : "当前处于全局模式，可直接创建新书并启动整本生产。"}
        </div>
        <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">{i18next.t("creativeHub.novelProductionStarterCard.749p3x")}</div>

        {novelDetailQuery.isFetching ? (
          <WorkspaceStateNotice
            compact
            loading
            tone="info"
            title={i18next.t("creativeHub.novelProductionStarterCard.vz5lat")}
            description={i18next.t("creativeHub.novelProductionStarterCard.5uspyy")}
          />
        ) : detailErrorMessage ? (
          <WorkspaceStateNotice
            compact
            tone="danger"
            title={i18next.t("creativeHub.novelProductionStarterCard.brg3d0")}
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
                {novelDetailQuery.isFetching ? "正在重试..." : "重新读取"}
              </Button>
            )}
          />
        ) : null}

        {!isContinueMode ? (
          <ProductionField
            htmlFor="creative-hub-production-title"
            label={i18next.t("basicInfo.novelTitle")}
            hint="创建新小说时必填。"
          >
            <input
              id="creative-hub-production-title"
              className={fieldClassName}
              placeholder={i18next.t("creativeHub.novelProductionStarterCard.zet2fo")}
              value={title}
              disabled={formDisabled}
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </ProductionField>
        ) : null}

        <ProductionField htmlFor="creative-hub-production-description" label={i18next.t("creativeHub.novelProductionStarterCard.rokqy")}>
          <textarea
            id="creative-hub-production-description"
            className={`${fieldClassName} min-h-[88px] resize-y`}
            placeholder={i18next.t("creativeHub.novelProductionStarterCard.5vhr9z")}
            value={description}
            disabled={formDisabled}
            onChange={(event) => setDescription(event.target.value)}
          />
        </ProductionField>

        <div className="grid gap-2 sm:grid-cols-2">
          <ProductionField htmlFor="creative-hub-production-genre" label={i18next.t("creativeHub.novelProductionStarterCard.jolqnc")}>
            <input
              id="creative-hub-production-genre"
              className={fieldClassName}
              placeholder={i18next.t("creativeHub.novelProductionStarterCard.ljr4p5")}
              value={genre}
              disabled={formDisabled}
              onChange={(event) => setGenre(event.target.value)}
            />
          </ProductionField>
          <ProductionField htmlFor="creative-hub-production-style" label={i18next.t("creativeHub.novelProductionStarterCard.jpj5rr")}>
            <input
              id="creative-hub-production-style"
              className={fieldClassName}
              placeholder={i18next.t("creativeHub.novelProductionStarterCard.dbs8pm")}
              value={styleTone}
              disabled={formDisabled}
              onChange={(event) => setStyleTone(event.target.value)}
            />
          </ProductionField>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <ProductionField htmlFor="creative-hub-production-pov" label={i18next.t("basicInfo.narrativePov")}>
            <SelectControl
              id="creative-hub-production-pov"
              className={fieldClassName}
              value={narrativePov}
              disabled={formDisabled}
              onChange={(event) => setNarrativePov(event.target.value)}
            >
              <option value="">{i18next.t("creativeHub.novelProductionStarterCard.wknu3u")}</option>
              <option value="第一人称">{i18next.t("dict.gen_f69e8c5f")}</option>
              <option value="第三人称">{i18next.t("dict.gen_5eff3cab")}</option>
              <option value="混合视角">{i18next.t("dict.gen_73b444ba")}</option>
            </SelectControl>
          </ProductionField>
          <ProductionField htmlFor="creative-hub-production-pace" label={i18next.t("creativeHub.novelProductionStarterCard.d679ts")}>
            <SelectControl
              id="creative-hub-production-pace"
              className={fieldClassName}
              value={pacePreference}
              disabled={formDisabled}
              onChange={(event) => setPacePreference(event.target.value)}
            >
              <option value="">{i18next.t("creativeHub.novelProductionStarterCard.wknu3u")}</option>
              <option value="慢节奏">{i18next.t("dict.gen_7209da38")}</option>
              <option value="均衡节奏">{i18next.t("creativeHub.novelProductionStarterCard.bkwd53")}</option>
              <option value="快节奏">{i18next.t("dict.gen_de82b2fd")}</option>
            </SelectControl>
          </ProductionField>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <ProductionField htmlFor="creative-hub-production-mode" label={i18next.t("creativeHub.novelProductionStarterCard.aueugr")}>
            <SelectControl
              id="creative-hub-production-mode"
              className={fieldClassName}
              value={projectMode}
              disabled={formDisabled}
              onChange={(event) => setProjectMode(event.target.value)}
            >
              <option value="">{i18next.t("creativeHub.novelProductionStarterCard.x05tr2")}</option>
              <option value="AI 主导">AI 主导</option>
              <option value="人机协作">{i18next.t("creativeHub.novelProductionStarterCard.aczqnh")}</option>
              <option value="草稿优先">{i18next.t("creativeHub.novelProductionStarterCard.h2eo5i")}</option>
              <option value="自动流水线">{i18next.t("creativeHub.novelProductionStarterCard.lmnhou")}</option>
            </SelectControl>
          </ProductionField>
          <ProductionField htmlFor="creative-hub-production-emotion" label={i18next.t("creativeHub.novelProductionStarterCard.cqg3ld")}>
            <SelectControl
              id="creative-hub-production-emotion"
              className={fieldClassName}
              value={emotionIntensity}
              disabled={formDisabled}
              onChange={(event) => setEmotionIntensity(event.target.value)}
            >
              <option value="">{i18next.t("creativeHub.novelProductionStarterCard.x05tr2")}</option>
              <option value="低">{i18next.t("dict.low")}</option>
              <option value="中">{i18next.t("dict.mid")}</option>
              <option value="高">{i18next.t("dict.gen_4296d7d2")}</option>
            </SelectControl>
          </ProductionField>
          <ProductionField htmlFor="creative-hub-production-freedom" label={i18next.t("basicInfo.aiFreedom")}>
            <SelectControl
              id="creative-hub-production-freedom"
              className={fieldClassName}
              value={aiFreedom}
              disabled={formDisabled}
              onChange={(event) => setAiFreedom(event.target.value)}
            >
              <option value="">{i18next.t("creativeHub.novelProductionStarterCard.x05tr2")}</option>
              <option value="低">{i18next.t("dict.low")}</option>
              <option value="中">{i18next.t("dict.mid")}</option>
              <option value="高">{i18next.t("dict.gen_4296d7d2")}</option>
            </SelectControl>
          </ProductionField>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <ProductionField htmlFor="creative-hub-production-chapters" label={i18next.t("creativeHub.novelProductionStarterCard.ikd4dn")}>
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
          <ProductionField htmlFor="creative-hub-production-length" label={i18next.t("creativeHub.novelProductionStarterCard.4bldu7")}>
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
          <ProductionField htmlFor="creative-hub-production-world" label={i18next.t("creativeHub.novelProductionStarterCard.nuc5dv")}>
            <input
              id="creative-hub-production-world"
              className={fieldClassName}
              placeholder={i18next.t("creativeHub.novelProductionStarterCard.ie1omb")}
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
            {submitMutation.isPending ? "正在启动..." : isContinueMode ? "继续整本生产" : "启动整本生产"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={formDisabled}
            onClick={() => onQuickAction?.("整本生成到哪一步了")}
          >{i18next.t("dict.gen_9600c918")}</Button>
          <Button
            type="button"
            variant="outline"
            disabled={formDisabled}
            onClick={() => onQuickAction?.("为什么整本生成没有启动")}
          >{i18next.t("creativeHub.creativeHubToolResultCard.dlwl3d")}</Button>
          <Button
            type="button"
            variant="outline"
            disabled={formDisabled}
            onClick={() => onQuickAction?.("基于当前小说信息，为生产前的题材、风格、视角、节奏、章长和 AI 自由度各给出 3 个备选答案。")}
          >{i18next.t("creativeHub.novelProductionStarterCard.f6lw8j")}</Button>
        </div>
      </div>
    </div>
  );
}
