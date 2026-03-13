import { useEffect, useState } from "react";
import type { CreativeHubProductionStatus } from "@ai-novel/shared/types/creativeHub";
import { Button } from "@/components/ui/button";

interface NovelProductionStarterCardProps {
  currentNovelTitle?: string | null;
  currentNovelId?: string | null;
  productionStatus?: CreativeHubProductionStatus | null;
  onSubmit: (prompt: string) => void;
  onQuickAction?: (prompt: string) => void;
}

function buildProductionPrompt(input: {
  currentNovelId?: string | null;
  title: string;
  description: string;
  targetChapterCount: number;
  worldType: string;
}) {
  const description = input.description.trim();
  const worldType = input.worldType.trim();
  const targetChapterCount = Math.max(1, Math.min(200, Math.floor(input.targetChapterCount || 20)));
  if (input.currentNovelId) {
    const segments = [`继续生成当前小说。目标章节数：${targetChapterCount}。`];
    if (description) {
      segments.push(`补充设定：${description}。`);
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
  const [worldType, setWorldType] = useState("");

  useEffect(() => {
    if (productionStatus?.targetChapterCount) {
      setTargetChapterCount(productionStatus.targetChapterCount);
    }
  }, [productionStatus?.targetChapterCount]);

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
            placeholder="目标章节数"
            type="number"
            min={1}
            max={200}
            value={targetChapterCount}
            onChange={(event) => setTargetChapterCount(Number(event.target.value || 20))}
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
            onClick={() => {
              if (!isContinueMode && !title.trim()) {
                return;
              }
              onSubmit(buildProductionPrompt({
                currentNovelId,
                title,
                description,
                targetChapterCount,
                worldType,
              }));
            }}
          >
            {isContinueMode ? "继续整本生产" : "启动整本生产"}
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
        </div>
      </div>
    </div>
  );
}
