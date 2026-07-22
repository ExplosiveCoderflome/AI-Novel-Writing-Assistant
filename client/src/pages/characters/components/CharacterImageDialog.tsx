import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useState } from "react";
import {
  buildCharacterImagePrompt,
  buildDefaultCharacterImageSourceDescription,
} from "@ai-novel/shared/imagePrompt";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BaseCharacter } from "@ai-novel/shared/types/novel";
import {
  generateCharacterImages,
  getImageTask,
  optimizeCharacterImagePrompt,
  type ImagePromptOutputLanguage,
} from "@/api/images";
import { getAPIKeySettings } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SelectControl from "@/components/common/SelectControl";

const IMAGE_STATUS_TEXT: Record<string, string> = {
  queued: t("gen.pages.characters.components.CharacterImageDialog.gen_e5ac1d20"),
  running: t("gen.pages.characters.components.CharacterImageDialog.gen_1ae3a984"),
  succeeded: t("gen.pages.characters.components.CharacterImageDialog.gen_b6c4a445"),
  failed: t("gen.pages.characters.components.CharacterImageDialog.gen_7f7de8a2"),
  cancelled: t("gen.pages.characters.components.CharacterImageDialog.gen_2111ccbb"),
};

type ImagePromptMode = "character_chain" | "direct";
type DirectPromptSource = "optimized" | "manual";

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
  const [directPrompt, setDirectPrompt] = useState("");
  const [directPromptSource, setDirectPromptSource] = useState<DirectPromptSource | null>(null);
  const [optimizedPromptLanguage, setOptimizedPromptLanguage] = useState<ImagePromptOutputLanguage>("zh");
  const [imageForm, setImageForm] = useState({
    stylePreset: t("gen.pages.characters.components.CharacterImageDialog.gen_7f5c7c44"),
    negativePrompt: t("gen.pages.characters.components.CharacterImageDialog.lowClarityDistortedExtraneousBodyTextWatermark"),
    provider: "" as LLMProvider,
    size: "1024x1024" as "512x512" | "768x768" | "1024x1024" | "1024x1536" | "1536x1024",
    count: 2,
  });

  const apiKeySettingsQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
    enabled: open,
  });

  const imageProviderOptions = useMemo(
    () => (apiKeySettingsQuery.data?.data ?? [])
      .filter((item) => item.isActive && item.isConfigured && item.supportsImageGeneration && item.currentImageModel)
      .map((item) => ({
        provider: item.provider,
        name: item.name,
        imageModel: item.currentImageModel ?? "",
      })),
    [apiKeySettingsQuery.data?.data],
  );

  useEffect(() => {
    if (!open || !character) {
      return;
    }
    setActiveTaskId(null);
    setSourcePrompt(buildDefaultCharacterImageSourceDescription(character));
    setPromptMode("character_chain");
    setDirectPrompt("");
    setDirectPromptSource(null);
    setOptimizedPromptLanguage("zh");
  }, [open, character]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (imageProviderOptions.length === 0) {
      if (imageForm.provider) {
        setImageForm((prev) => ({ ...prev, provider: "" }));
      }
      return;
    }
    const currentStillAvailable = imageProviderOptions.some((item) => item.provider === imageForm.provider);
    if (!currentStillAvailable) {
      setImageForm((prev) => ({
        ...prev,
        provider: imageProviderOptions[0]?.provider ?? "",
      }));
    }
  }, [imageForm.provider, imageProviderOptions, open]);

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
    ? directPrompt
    : originalPromptPreview.trim();
  const hasDirectPrompt = directPrompt.trim().length > 0;

  const currentSendModeLabel = promptMode === "direct"
    ? (directPromptSource === "optimized" ? t("gen.pages.characters.components.CharacterImageDialog.optimizePromptA") : t("gen.pages.characters.components.CharacterImageDialog.gen_3ec5bafe"))
    : t("gen.pages.characters.components.CharacterImageDialog.gen_e799da59");
  const currentSendModeClass = promptMode === "direct"
    ? (directPromptSource === "optimized"
      ? "rounded-full bg-emerald-50 px-3 py-1 text-emerald-700"
      : "rounded-full bg-amber-50 px-3 py-1 text-amber-700")
    : "rounded-full bg-slate-100 px-3 py-1 text-slate-700";

  const activateDirectPrompt = (value: string, source: DirectPromptSource) => {
    setDirectPrompt(value);
    setPromptMode("direct");
    setDirectPromptSource(source);
  };

  const restoreOriginalChainPrompt = () => {
    setPromptMode("character_chain");
    setDirectPrompt("");
    setDirectPromptSource(null);
  };

  const updateSourcePrompt = (value: string) => {
    setSourcePrompt(value);
    if (directPromptSource === "optimized") {
      restoreOriginalChainPrompt();
    }
  };

  const updateStylePreset = (value: string) => {
    setImageForm((prev) => ({ ...prev, stylePreset: value }));
    if (directPromptSource === "optimized") {
      restoreOriginalChainPrompt();
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
        throw new Error(t("gen.pages.characters.components.CharacterImageDialog.gen_05ce9b2e"));
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
      activateDirectPrompt(response.data?.prompt?.trim() ?? "", "optimized");
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!character) {
        throw new Error(t("gen.pages.characters.components.CharacterImageDialog.gen_05ce9b2e"));
      }
      if (!imageForm.provider) {
        throw new Error(t("gen.pages.characters.components.CharacterImageDialog.gen_27649b80"));
      }
      return generateCharacterImages({
        sceneType: "character",
        sceneId: character.id,
        prompt: promptMode === "direct" ? directPrompt.trim() : sourcePrompt,
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
              <div className="text-sm font-semibold text-slate-900">{t("gen.pages.characters.components.CharacterImageDialog.gen_80015db9")}</div>
              <div className="text-xs leading-5 text-slate-500">
                这里填写角色描述。点击“AI优化Prompt”后，会把这段描述整理成图片生成专用 prompt。
              </div>
            </div>
            <textarea
              className="min-h-[190px] max-h-[38vh] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder={t("gen.pages.characters.components.CharacterImageDialog.gen_8d71845f")}
              value={sourcePrompt}
              onChange={(event) => updateSourcePrompt(event.target.value)}
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{t("gen.pages.characters.components.CharacterImageDialog.optimizeOutputLanguage")}</div>
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
                    {optimizeMutation.isPending ? t("gen.pages.characters.components.CharacterImageDialog.optimizingInProgress") : t("gen.pages.characters.components.CharacterImageDialog.optimizePromptB")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="whitespace-nowrap rounded-xl px-4 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    onClick={restoreOriginalChainPrompt}
                    disabled={promptMode !== "direct" && !hasDirectPrompt}
                  >
                    恢复原链路
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm xl:justify-end">
                  <span className="text-slate-500">{t("gen.pages.characters.components.CharacterImageDialog.gen_ff04aacc")}</span>
                  <span className={currentSendModeClass}>{currentSendModeLabel}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/55 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900">{t("gen.pages.characters.components.CharacterImageDialog.gen_236c0cf1")}</div>
              <div className="text-xs leading-5 text-slate-500">
                这里展示最终会发送给图像模型的 prompt。你可以直接手动编辑；AI 优化后，也可以继续在这里修改。
              </div>
            </div>
            <textarea
              className="min-h-[240px] max-h-[42vh] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              value={finalPromptPreview}
              onChange={(event) => {
                activateDirectPrompt(event.target.value, "manual");
              }}
            />
          </section>

          <div className="grid gap-2 md:grid-cols-2">
            <input
              className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder={t("gen.pages.characters.components.CharacterImageDialog.gen_fdbc4d32")}
              value={imageForm.stylePreset}
              onChange={(event) => updateStylePreset(event.target.value)}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder={t("gen.pages.characters.components.CharacterImageDialog.gen_2300a232")}
              value={imageForm.negativePrompt}
              onChange={(event) => setImageForm((prev) => ({ ...prev, negativePrompt: event.target.value }))}
            />

            <label className="space-y-1 text-sm">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{t("gen.pages.characters.components.CharacterImageDialog.gen_b51bd70b")}</div>
              <SelectControl
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={imageForm.provider}
                disabled={imageProviderOptions.length === 0}
                onChange={(event) =>
                  setImageForm((prev) => ({
                    ...prev,
                    provider: event.target.value as LLMProvider,
                  }))}
              >
                {imageProviderOptions.length === 0 ? (
                  <option value="">{t("gen.pages.characters.components.CharacterImageDialog.gen_fca97c09")}</option>
                ) : null}
                {imageProviderOptions.map((item) => (
                  <option key={item.provider} value={item.provider}>
                    {item.name} · {item.imageModel}
                  </option>
                ))}
              </SelectControl>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{t("gen.pages.characters.components.CharacterImageDialog.gen_c8339fd2")}</div>
              <SelectControl
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
              </SelectControl>
            </label>

            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{t("gen.pages.characters.components.CharacterImageDialog.gen_3922a4bb")}</div>
              <SelectControl
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={String(imageForm.count)}
                onChange={(event) =>
                  setImageForm((prev) => ({
                    ...prev,
                    count: Number(event.target.value),
                  }))}
              >
                <option value="1">{t("gen.pages.characters.components.CharacterImageDialog.onePage")}</option>
                <option value="2">{t("gen.pages.characters.components.CharacterImageDialog.twoPages")}</option>
                <option value="3">{t("gen.pages.characters.components.CharacterImageDialog.threePages")}</option>
                <option value="4">{t("gen.pages.characters.components.CharacterImageDialog.fourPages")}</option>
              </SelectControl>
            </label>
          </div>

          {activeTask ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div>{t("gen.pages.characters.components.CharacterImageDialog.gen_f33bd525")}</div>
              {activeTask.error ? (
                <div className="mt-1 text-xs text-destructive">{activeTask.error}</div>
              ) : null}
            </div>
          ) : null}

          <Button
            className="h-11 rounded-xl px-6"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !finalPromptPreview.trim() || !imageForm.provider || Boolean(activeTaskId)}
          >
            {generateMutation.isPending ? t("gen.pages.characters.components.CharacterImageDialog.gen_c661e656") : t("gen.pages.characters.components.CharacterImageDialog.gen_dac38a8b")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
