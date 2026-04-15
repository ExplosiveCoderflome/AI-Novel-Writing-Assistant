import { useEffect, useMemo, useState } from "react";
import {
  buildCharacterImagePrompt,
  buildDefaultCharacterImageSourceDescription,
} from "@ai-novel/shared/imagePrompt";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import {
  generateCharacterImages,
  getImageTask,
  optimizeCharacterImagePrompt,
  type ImagePromptOutputLanguage,
} from "@/api/images";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const IMAGE_STATUS_TEXT: Record<string, string> = {
  queued: "排队中",
  running: "生成中",
  succeeded: "生成成功",
  failed: "生成失败",
  cancelled: "已取消",
};

type ImagePromptMode = "character_chain" | "direct";

interface CharacterImageDialogProps {
  open: boolean;
  character: BaseCharacter | null;
  onOpenChange: (open: boolean) => void;
  onTaskCompleted?: (baseCharacterId: string) => void;
}

export function CharacterImageDialog({
  open,
  character,
  onOpenChange,
  onTaskCompleted,
}: CharacterImageDialogProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [sourcePrompt, setSourcePrompt] = useState("");
  const [promptMode, setPromptMode] = useState<ImagePromptMode>("character_chain");
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [optimizedPromptLanguage, setOptimizedPromptLanguage] = useState<ImagePromptOutputLanguage>("zh");
  const [imageForm, setImageForm] = useState({
    stylePreset: "写实人像",
    negativePrompt: "低清晰度，畸形，多余肢体，文字水印",
    provider: "grok" as "openai" | "siliconflow" | "grok",
    size: "1024x1024" as "512x512" | "768x768" | "1024x1024" | "1024x1536" | "1536x1024",
    count: 2,
  });

  useEffect(() => {
    if (!open || !character) {
      return;
    }
    setActiveTaskId(null);
    setSourcePrompt(buildDefaultCharacterImageSourceDescription(character));
    setPromptMode("character_chain");
    setOptimizedPrompt("");
    setOptimizedPromptLanguage("zh");
  }, [open, character]);

  const originalPromptPreview = useMemo(() => {
    if (!character) {
      return sourcePrompt.trim();
    }
    return buildCharacterImagePrompt({
      prompt: sourcePrompt,
      stylePreset: imageForm.stylePreset,
      character,
    });
  }, [character, imageForm.stylePreset, sourcePrompt]);

  const finalPromptPreview = promptMode === "direct"
    ? optimizedPrompt.trim()
    : originalPromptPreview.trim();

  const clearOptimizedPrompt = () => {
    setPromptMode("character_chain");
    setOptimizedPrompt("");
  };

  const updateSourcePrompt = (value: string) => {
    setSourcePrompt(value);
    if (promptMode === "direct" || optimizedPrompt.trim()) {
      clearOptimizedPrompt();
    }
  };

  const updateStylePreset = (value: string) => {
    setImageForm((prev) => ({ ...prev, stylePreset: value }));
    if (promptMode === "direct" || optimizedPrompt.trim()) {
      clearOptimizedPrompt();
    }
  };

  const activeTaskQuery = useQuery({
    queryKey: queryKeys.images.task(activeTaskId ?? "none"),
    queryFn: () => getImageTask(activeTaskId as string),
    enabled: Boolean(activeTaskId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (!status || status === "queued" || status === "running") {
        return 1500;
      }
      return false;
    },
  });

  useEffect(() => {
    const task = activeTaskQuery.data?.data;
    if (!task || !activeTaskId) {
      return;
    }
    if (task.status === "queued" || task.status === "running") {
      return;
    }
    if (task.baseCharacterId) {
      onTaskCompleted?.(task.baseCharacterId);
    }
    setActiveTaskId(null);
  }, [activeTaskId, activeTaskQuery.data, onTaskCompleted]);

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      if (!character) {
        throw new Error("请先选择角色。");
      }
      return optimizeCharacterImagePrompt({
        sceneType: "character",
        sceneId: character.id,
        sourcePrompt,
        stylePreset: imageForm.stylePreset,
        outputLanguage: optimizedPromptLanguage,
      });
    },
    onSuccess: (response) => {
      setOptimizedPrompt(response.data?.prompt?.trim() ?? "");
      setPromptMode("direct");
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!character) {
        throw new Error("请先选择角色。");
      }
      return generateCharacterImages({
        sceneType: "character",
        sceneId: character.id,
        prompt: promptMode === "direct" ? optimizedPrompt.trim() : sourcePrompt,
        promptMode,
        stylePreset: imageForm.stylePreset,
        negativePrompt: imageForm.negativePrompt,
        provider: imageForm.provider,
        size: imageForm.size,
        count: imageForm.count,
      });
    },
    onSuccess: (response) => {
      const taskId = response.data?.id;
      if (taskId) {
        setActiveTaskId(taskId);
      }
    },
  });

  const activeTask = activeTaskQuery.data?.data;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setActiveTaskId(null);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[980px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-6 pb-4 pt-5">
          <DialogTitle className="text-[22px] font-semibold tracking-tight text-slate-900">
            生成角色形象图
            {character ? `：${character.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/65 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900">角色描述 / AI优化输入</div>
              <div className="text-xs leading-5 text-slate-500">
              这里写角色描述；点击“AI优化Prompt”后，会把这段描述整理成图片生成专用 prompt。
              </div>
            </div>
            <textarea
              className="min-h-[190px] max-h-[38vh] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="输入角色描述（越具体越好）"
              value={sourcePrompt}
              onChange={(event) => updateSourcePrompt(event.target.value)}
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">优化输出语言</div>
                <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1 sm:w-auto">
                  <Button
                    type="button"
                    variant={optimizedPromptLanguage === "zh" ? "default" : "ghost"}
                    size="sm"
                    className="min-w-[92px] flex-1 rounded-lg sm:flex-none"
                    onClick={() => setOptimizedPromptLanguage("zh")}
                  >
                    中文
                  </Button>
                  <Button
                    type="button"
                    variant={optimizedPromptLanguage === "en" ? "default" : "ghost"}
                    size="sm"
                    className="min-w-[92px] flex-1 rounded-lg sm:flex-none"
                    onClick={() => setOptimizedPromptLanguage("en")}
                  >
                    English
                  </Button>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-3 xl:items-end">
                <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
                  <Button
                    type="button"
                    variant="outline"
                    className="whitespace-nowrap rounded-xl border-slate-300 bg-white px-4"
                    onClick={() => optimizeMutation.mutate()}
                    disabled={optimizeMutation.isPending || !sourcePrompt.trim()}
                  >
                    {optimizeMutation.isPending ? "优化中..." : "AI优化Prompt"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="whitespace-nowrap rounded-xl px-4 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    onClick={clearOptimizedPrompt}
                    disabled={promptMode !== "direct" && !optimizedPrompt.trim()}
                  >
                    恢复原链路
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm xl:justify-end">
                  <span className="text-slate-500">当前发送模式</span>
                  <span
                    className={
                      promptMode === "direct"
                        ? "rounded-full bg-emerald-50 px-3 py-1 text-emerald-700"
                        : "rounded-full bg-slate-100 px-3 py-1 text-slate-700"
                    }
                  >
                    {promptMode === "direct" ? "AI优化 Prompt" : "原链路 Prompt"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/55 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900">最终发送 Prompt 预览</div>
              <div className="text-xs leading-5 text-slate-500">
              已把原链路会用到的完整提示词都展示在这里；AI优化后，这里会切换为优化结果。
              </div>
            </div>
            <textarea
              className="min-h-[240px] max-h-[42vh] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              value={finalPromptPreview}
              readOnly={promptMode !== "direct"}
              onChange={(event) => {
                if (promptMode === "direct") {
                  setOptimizedPrompt(event.target.value);
                }
              }}
            />
          </section>

          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="风格预设（如：电影感写实）"
              value={imageForm.stylePreset}
              onChange={(event) => updateStylePreset(event.target.value)}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="负向提示词（避免出现）"
              value={imageForm.negativePrompt}
              onChange={(event) => setImageForm((prev) => ({ ...prev, negativePrompt: event.target.value }))}
            />
            <label className="space-y-1 text-sm">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">模型厂商</div>
              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={imageForm.provider}
                onChange={(event) =>
                  setImageForm((prev) => ({
                    ...prev,
                    provider: event.target.value as "openai" | "siliconflow" | "grok",
                  }))}
              >
                <option value="grok">Grok (xAI)</option>
                <option value="openai">OpenAI</option>
                <option value="siliconflow">SiliconFlow</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">尺寸</div>
              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={imageForm.size}
                onChange={(event) =>
                  setImageForm((prev) => ({
                    ...prev,
                    size: event.target.value as typeof prev.size,
                  }))}
              >
                <option value="512x512">512x512</option>
                <option value="768x768">768x768</option>
                <option value="1024x1024">1024x1024</option>
                <option value="1024x1536">1024x1536</option>
                <option value="1536x1024">1536x1024</option>
              </select>
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">生成张数</div>
              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={String(imageForm.count)}
                onChange={(event) =>
                  setImageForm((prev) => ({
                    ...prev,
                    count: Number(event.target.value),
                  }))}
              >
                <option value="1">1 张</option>
                <option value="2">2 张</option>
                <option value="3">3 张</option>
                <option value="4">4 张</option>
              </select>
            </label>
          </div>

          {activeTask ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div>当前任务状态：{IMAGE_STATUS_TEXT[activeTask.status] ?? activeTask.status}</div>
              {activeTask.error ? (
                <div className="mt-1 text-xs text-destructive">{activeTask.error}</div>
              ) : null}
            </div>
          ) : null}

          <Button
            className="h-11 rounded-xl px-6"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !finalPromptPreview.trim() || Boolean(activeTaskId)}
          >
            {generateMutation.isPending ? "提交任务中..." : "开始生成"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
