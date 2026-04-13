import { useEffect, useState } from "react";
import type { CreativeHubProductionStatus } from "@ai-novel/shared/types/creativeHub";
import { getNovelDetail, updateNovel } from "@/api/novel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

interface NovelProductionStarterCardProps {
  currentNovelTitle?: string | null;
  currentNovelId?: string | null;
  productionStatus?: CreativeHubProductionStatus | null;
  onSubmit: (prompt: string) => void;
  onQuickAction?: (prompt: string) => void;
}

function fromNarrativePov(value: "first_person" | "third_person" | "mixed" | null | undefined): string {
  if (value === "first_person") return "第一人称";
  if (value === "third_person") return "第三人称";
  if (value === "mixed") return "混合视角";
  return "";
}

function toNarrativePov(value: string): "first_person" | "third_person" | "mixed" | null {
  if (value === "第一人称") return "first_person";
  if (value === "第三人称") return "third_person";
  if (value === "混合视角") return "mixed";
  return null;
}

function fromPacePreference(value: "slow" | "balanced" | "fast" | null | undefined): string {
  if (value === "slow") return "慢节奏";
  if (value === "balanced") return "均衡节奏";
  if (value === "fast") return "快节奏";
  return "";
}

function toPacePreference(value: string): "slow" | "balanced" | "fast" | null {
  if (value === "慢节奏") return "slow";
  if (value === "均衡节奏") return "balanced";
  if (value === "快节奏") return "fast";
  return null;
}

function fromProjectMode(value: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline" | null | undefined): string {
  if (value === "ai_led") return "AI 主导";
  if (value === "co_pilot") return "人机协作";
  if (value === "draft_mode") return "草稿优先";
  if (value === "auto_pipeline") return "自动流水线";
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
  if (value === "low") return "低";
  if (value === "medium") return "中";
  if (value === "high") return "高";
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (productionStatus?.targetChapterCount) {
      setTargetChapterCount(productionStatus.targetChapterCount);
    }
  }, [productionStatus?.targetChapterCount]);

  useEffect(() => {
    let cancelled = false;
    if (!currentNovelId) {
      return () => {
        cancelled = true;
      };
    }
    void getNovelDetail(currentNovelId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const novel = response.data;
        if (!novel) {
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
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentNovelId]);

  const resolvedTitle = currentNovelTitle?.trim() || "";
  const isContinueMode = Boolean(currentNovelId);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-medium text-slate-500">整本生产</div>
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {isContinueMode
            ? `当前将继续生产《${resolvedTitle || "当前小说"}》。`
            : "当前处于全局模式，可直接创建新书并启动整本生产。"}
        </div>
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
          建议先确认：题材、风格、视角、节奏、章长、AI 自由度。条件越完整，整本生产偏差越小。
        </div>
        {!isContinueMode ? (
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            placeholder="小说标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        ) : null}
        <textarea
          className="min-h-[88px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
          placeholder="简介 / 核心设定"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            placeholder="题材类型，例如：东方玄幻 / 都市悬疑"
            value={genre}
            onChange={(event) => setGenre(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            placeholder="风格基调，例如：冷峻压抑 / 轻快热血"
            value={styleTone}
            onChange={(event) => setStyleTone(event.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            value={narrativePov}
            onChange={(event) => setNarrativePov(event.target.value)}
          >
            <option value="">叙事视角</option>
            <option value="第一人称">第一人称</option>
            <option value="第三人称">第三人称</option>
            <option value="混合视角">混合视角</option>
          </select>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            value={pacePreference}
            onChange={(event) => setPacePreference(event.target.value)}
          >
            <option value="">推进节奏</option>
            <option value="慢节奏">慢节奏</option>
            <option value="均衡节奏">均衡节奏</option>
            <option value="快节奏">快节奏</option>
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            value={projectMode}
            onChange={(event) => setProjectMode(event.target.value)}
          >
            <option value="">协作模式</option>
            <option value="AI 主导">AI 主导</option>
            <option value="人机协作">人机协作</option>
            <option value="草稿优先">草稿优先</option>
            <option value="自动流水线">自动流水线</option>
          </select>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            value={emotionIntensity}
            onChange={(event) => setEmotionIntensity(event.target.value)}
          >
            <option value="">情绪强度</option>
            <option value="低">低</option>
            <option value="中">中</option>
            <option value="高">高</option>
          </select>
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            value={aiFreedom}
            onChange={(event) => setAiFreedom(event.target.value)}
          >
            <option value="">AI 自由度</option>
            <option value="低">低</option>
            <option value="中">中</option>
            <option value="高">高</option>
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            placeholder="目标章节数"
            type="number"
            min={1}
            max={200}
            value={targetChapterCount}
            onChange={(event) => setTargetChapterCount(Number(event.target.value || 20))}
          />
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            placeholder="默认章长（字）"
            type="number"
            min={500}
            max={10000}
            value={defaultChapterLength}
            onChange={(event) => setDefaultChapterLength(Number(event.target.value || 2500))}
          />
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            placeholder="可选世界观类型"
            value={worldType}
            onChange={(event) => setWorldType(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={async () => {
              if (!isContinueMode && !title.trim()) {
                return;
              }
              setIsSubmitting(true);
              try {
                if (currentNovelId) {
                  await updateNovel(currentNovelId, {
                    ...(description.trim() ? { description: description.trim() } : {}),
                    ...(styleTone.trim() ? { styleTone: styleTone.trim() } : {}),
                    ...(toNarrativePov(narrativePov) ? { narrativePov: toNarrativePov(narrativePov) } : {}),
                    ...(toPacePreference(pacePreference) ? { pacePreference: toPacePreference(pacePreference) } : {}),
                    ...(toProjectMode(projectMode) ? { projectMode: toProjectMode(projectMode) } : {}),
                    ...(toLevel(emotionIntensity) ? { emotionIntensity: toLevel(emotionIntensity) } : {}),
                    ...(toLevel(aiFreedom) ? { aiFreedom: toLevel(aiFreedom) } : {}),
                    ...(defaultChapterLength ? { defaultChapterLength: Math.max(500, Math.min(10000, defaultChapterLength)) } : {}),
                  });
                }
                onSubmit(buildProductionPrompt({
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
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "生产前条件保存失败。");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            {isSubmitting ? "处理中..." : isContinueMode ? "继续整本生产" : "启动整本生产"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onQuickAction?.("整本生成到哪一步了")}
          >
            查看进度
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onQuickAction?.("为什么整本生成没有启动")}
            >
              查看阻塞
            </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onQuickAction?.("基于当前小说信息，为生产前的题材、风格、视角、节奏、章长和 AI 自由度各给出 3 个备选答案。")}
          >
            生成备选
          </Button>
        </div>
      </div>
    </div>
  );
}
