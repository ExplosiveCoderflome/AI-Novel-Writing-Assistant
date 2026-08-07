import { useEffect, useMemo, useState } from "react";
import { DEFAULT_NOVEL_COVER_NEGATIVE_PROMPT, DEFAULT_NOVEL_COVER_STYLE_PRESET, buildNovelCoverImagePrompt } from "@ai-novel/shared/imagePrompt";
import {
  DEFAULT_NOVEL_COVER_IMAGE_COUNT,
  DEFAULT_NOVEL_COVER_IMAGE_SIZE,
  type ImageAsset,
} from "@ai-novel/shared/types/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  deleteImageAsset,
  generateNovelCover,
  getImageTask,
  listImageAssets,
  optimizeNovelCoverPrompt,
  resolveImageAssetUrl,
  setPrimaryImageAsset,
  type GenerateNovelCoverPayload,
  type ImagePromptOutputLanguage,
  type NovelCoverPromptMode,
} from "@/api/images";
import { queryKeys } from "@/api/queryKeys";
import { getAPIKeySettings } from "@/api/settings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StoryWorldSliceView } from "@ai-novel/shared/types/storyWorldSlice";
import type { NovelBasicFormState } from "../../novelBasicInfo.shared";
import {
  buildNovelCoverDraftContext,
  buildNovelCoverDraftSourcePrompt,
  type BuildNovelCoverDraftInput,
} from "./novelCoverDraft";
import SelectControl from "@/components/common/SelectControl";

const IMAGE_STATUS_TEXT: Record<string, string> = { queued: "queued", running: "generating", succeeded: "generating successfully", failed: "generating failed", cancelled: "cancelled", }; type DirectPromptSource = "optimized" | "manual"; type CoverSize = NonNullable<GenerateNovelCoverPayload["size"]>;

interface GenreOption {
  id: string;
  label: string;
  path: string;
}

interface StoryModeOption {
  id: string;
  name: string;
  label: string;
  path: string;
}

interface WorldOption {
  id: string;
  name: string;
}

interface NovelCoverDialogProps {
  open: boolean;
  novelId: string;
  basicForm: NovelBasicFormState;
  genreOptions: GenreOption[];
  storyModeOptions: StoryModeOption[];
  worldOptions: WorldOption[];
  worldSliceView?: StoryWorldSliceView | null;
  onOpenChange: (open: boolean) => void;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function NovelCoverDialog(props: NovelCoverDialogProps) {
  const queryClient = useQueryClient();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [sourcePrompt, setSourcePrompt] = useState("");
  const [promptMode, setPromptMode] = useState<NovelCoverPromptMode>("novel_cover_chain");
  const [directPrompt, setDirectPrompt] = useState("");
  const [directPromptSource, setDirectPromptSource] = useState<DirectPromptSource | null>(null);
  const [optimizedPromptLanguage, setOptimizedPromptLanguage] = useState<ImagePromptOutputLanguage>("zh");
  const [imageForm, setImageForm] = useState({
    stylePreset: DEFAULT_NOVEL_COVER_STYLE_PRESET,
    negativePrompt: DEFAULT_NOVEL_COVER_NEGATIVE_PROMPT,
    provider: "" as LLMProvider,
    size: DEFAULT_NOVEL_COVER_IMAGE_SIZE as CoverSize,
    count: DEFAULT_NOVEL_COVER_IMAGE_COUNT,
  });

  const draftInput = useMemo<BuildNovelCoverDraftInput>(() => ({
    basicForm: props.basicForm,
    genreOptions: props.genreOptions,
    storyModeOptions: props.storyModeOptions,
    worldOptions: props.worldOptions,
    worldSliceView: props.worldSliceView,
  }), [
    props.basicForm,
    props.genreOptions,
    props.storyModeOptions,
    props.worldOptions,
    props.worldSliceView,
  ]);

  const promptContext = useMemo(
    () => buildNovelCoverDraftContext(draftInput),
    [draftInput],
  );

  const apiKeySettingsQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
    enabled: props.open,
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

  const assetsQuery = useQuery({
    queryKey: queryKeys.images.assets("novel_cover", props.novelId),
    queryFn: () => listImageAssets({
      sceneType: "novel_cover",
      sceneId: props.novelId,
    }),
    enabled: props.open,
    staleTime: 30_000,
  });

  const assets = assetsQuery.data?.data ?? [];

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setActiveTaskId(null);
    setSourcePrompt(buildNovelCoverDraftSourcePrompt(draftInput));
    setPromptMode("novel_cover_chain");
    setDirectPrompt("");
    setDirectPromptSource(null);
    setOptimizedPromptLanguage("zh");
  }, [draftInput, props.open]);

  useEffect(() => {
    if (!props.open) {
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
  }, [imageForm.provider, imageProviderOptions, props.open]);

  const originalPromptPreview = useMemo(
    () => buildNovelCoverImagePrompt({
      prompt: sourcePrompt,
      stylePreset: imageForm.stylePreset,
      novel: promptContext,
    }).trim(),
    [imageForm.stylePreset, promptContext, sourcePrompt],
  );

  const finalPromptPreview = promptMode === "direct"
    ? directPrompt
    : originalPromptPreview;
  const hasDirectPrompt = directPrompt.trim().length > 0;

  const currentSendModeLabel = promptMode === "direct"
    ? (directPromptSource === "optimized" ? "AI Optimization Prompt" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.")
    : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
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
    setPromptMode("novel_cover_chain");
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
    void queryClient.invalidateQueries({
      queryKey: queryKeys.images.assets("novel_cover", task.novelId ?? props.novelId),
    });
    setActiveTaskId(null);
  }, [activeTaskId, activeTaskQuery.data, props.novelId, queryClient]);

  const optimizeMutation = useMutation({
    mutationFn: async () => optimizeNovelCoverPrompt({
      sceneType: "novel_cover",
      sceneId: props.novelId,
      sourcePrompt,
      stylePreset: imageForm.stylePreset,
      outputLanguage: optimizedPromptLanguage,
    }),
    onSuccess: (response) => {
      activateDirectPrompt(response.data?.prompt?.trim() ?? "", "optimized");
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!imageForm.provider) {
        throw new Error("Please configure the manufacturers and models that support image generation in the system settings first.");
      }
      return generateNovelCover({
        sceneType: "novel_cover",
        sceneId: props.novelId,
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

  const setPrimaryMutation = useMutation({
    mutationFn: (assetId: string) => setPrimaryImageAsset(assetId),
    onSuccess: async (response) => {
      const novelId = response.data?.novelId ?? props.novelId;
      await queryClient.invalidateQueries({
        queryKey: queryKeys.images.assets("novel_cover", novelId),
      });
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => deleteImageAsset(assetId),
    onSuccess: async (response) => {
      const novelId = response.data?.novelId ?? props.novelId;
      await queryClient.invalidateQueries({
        queryKey: queryKeys.images.assets("novel_cover", novelId),
      });
    },
  });

  const activeTask = activeTaskQuery.data?.data;

  const handleDeleteAsset = async (asset: ImageAsset) => {
    const confirmed = window.confirm("Are you sure you want to delete this cover image? If it is the current main cover, the system will automatically add a new main image.");
    if (!confirmed) {
      return;
    }
    await deleteAssetMutation.mutateAsync(asset.id);
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setActiveTaskId(null);
        }
        props.onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[1120px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-6 pb-4 pt-5">
          <DialogTitle className="text-[22px] font-semibold tracking-tight text-slate-900">
            Generate novel cover main screen
                                  {promptContext.title ? `：${promptContext.title}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {imageProviderOptions.length === 0 ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-medium">Cannot start generating yet</div>
              <div className="mt-1 leading-6">
                There are currently no image models configured. Please come first
                                              {" "}
                <Link className="font-medium underline underline-offset-2" to="/settings">
                  System settings
                                                  </Link>
                {" "}
                Complete the vendors and models that support image generation, and then come back here to continue.
                                            </div>
            </section>
          ) : null}

          <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/65 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900">Novel information draft/AI optimization input</div>
              <div className="text-xs leading-5 text-slate-500">
                The system has compiled a draft of the cover input based on the basic information of the current novel. You can change it directly, or you can click "AI Optimization Prompt" first and then continue to adjust it manually.
                                            </div>
            </div>
            <textarea
              className="min-h-[190px] max-h-[34vh] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="Describe what kind of cover image you want to highlight in this book."
              value={sourcePrompt}
              onChange={(event) => updateSourcePrompt(event.target.value)}
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Optimize output language</div>
                <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1 sm:w-auto">
                  <Button
                    type="button"
                    variant={optimizedPromptLanguage === "zh" ? "default" : "ghost"}
                    size="sm"
                    className="min-w-[92px] flex-1 rounded-lg sm:flex-none"
                    onClick={() => setOptimizedPromptLanguage("zh")}
                  >
                    Chinese
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
                    {optimizeMutation.isPending ? "Optimizing..." : "AI Optimization Prompt"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="whitespace-nowrap rounded-xl px-4 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    onClick={restoreOriginalChainPrompt}
                    disabled={promptMode !== "direct" && !hasDirectPrompt}
                  >
                    Restore original link
                                                        </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm xl:justify-end">
                  <span className="text-slate-500">Current sending mode</span>
                  <span className={currentSendModeClass}>{currentSendModeLabel}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/55 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900">Finally send Prompt preview</div>
              <div className="text-xs leading-5 text-slate-500">
                Shown here is the prompt that will eventually be sent to the image model. You can edit directly or continue to make fine adjustments after AI optimization.
                                            </div>
            </div>
            <textarea
              className="min-h-[240px] max-h-[40vh] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              value={finalPromptPreview}
              onChange={(event) => {
                activateDirectPrompt(event.target.value, "manual");
              }}
            />
          </section>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 xl:col-span-2"
              placeholder="Style presets, such as: cinematic illustrations, high recognition"
              value={imageForm.stylePreset}
              onChange={(event) => updateStylePreset(event.target.value)}
            />
            <input
              className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 xl:col-span-2"
              placeholder="Negative prompt words, such as: text, watermark, low definition, malformation"
              value={imageForm.negativePrompt}
              onChange={(event) => setImageForm((prev) => ({ ...prev, negativePrompt: event.target.value }))}
            />

            <label className="space-y-1 text-sm">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Model manufacturer</div>
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
                  <option value="">Please fill in the image model in the system settings first</option>
                ) : null}
                {imageProviderOptions.map((item) => (
                  <option key={item.provider} value={item.provider}>
                    {item.name} · {item.imageModel}
                  </option>
                ))}
              </SelectControl>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</div>
              <SelectControl
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={imageForm.size}
                onChange={(event) =>
                  setImageForm((prev) => ({
                    ...prev,
                    size: event.target.value as CoverSize,
                  }))}
              >
                <option value="1024x1536">1024x1536 (vertical version recommended)</option>
                <option value="1024x1024">1024x1024</option>
                <option value="1536x1024">1536x1024</option>
              </SelectControl>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Number of generated sheets</div>
              <SelectControl
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={String(imageForm.count)}
                onChange={(event) =>
                  setImageForm((prev) => ({
                    ...prev,
                    count: Number(event.target.value),
                  }))}
              >
                <option value="1">1 piece</option>
                <option value="2">2 sheets</option>
                <option value="3">3 sheets</option>
                <option value="4">4 pictures</option>
              </SelectControl>
            </label>

            <div className="flex items-end">
              <Button
                className="h-11 w-full rounded-xl px-6"
                onClick={() => generateMutation.mutate()}
                disabled={
                  generateMutation.isPending
                  || !finalPromptPreview.trim()
                  || !imageForm.provider
                  || Boolean(activeTaskId)
                }
              >
                {generateMutation.isPending ? "Submitting task..." : "Starting generation"}
              </Button>
            </div>
          </div>

          {optimizeMutation.isError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {getErrorMessage(optimizeMutation.error, "AI optimization failed, please try again later.")}
            </div>
          ) : null}

          {generateMutation.isError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {getErrorMessage(generateMutation.error, "Failed to submit image task, please try again later.")}
            </div>
          ) : null}

          {activeTask ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div>Current task status:{IMAGE_STATUS_TEXT[activeTask.status] ?? activeTask.status}</div>
              {activeTask.error ? (
                <div className="mt-1 text-xs text-destructive">{activeTask.error}</div>
              ) : null}
            </div>
          ) : null}

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Cover Gallery</div>
                <div className="text-xs leading-5 text-slate-500">
                  It will automatically return here after the generation is successful. The first successful image will be automatically set as the main image if there is currently no main cover.
                                                  </div>
              </div>
            </div>

            {assetsQuery.isLoading ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                Loading cover gallery...
                                            </div>
            ) : null}

            {!assetsQuery.isLoading && assets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                No cover image yet. Submit the generation task first, and it will appear here after success.
                                            </div>
            ) : null}

            {assets.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {assets.map((asset) => (
                  <div key={asset.id} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="aspect-[2/3] w-full">
                        <img
                          src={resolveImageAssetUrl(asset.url)}
                          alt={`Candidate cover image for ${promptContext.title || "Novel"}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={asset.isPrimary
                        ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                        : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"}
                      >
                        {asset.isPrimary ? "Current main cover" : "candidate image"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {asset.width && asset.height ? `${asset.width} x ${asset.height}` : "Size to be determined"}
                      </span>
                    </div>

                    {asset.localPath ? (
                      <div className="text-[11px] leading-5 text-slate-500 break-all">
                        Local path:{asset.localPath}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={asset.isPrimary || setPrimaryMutation.isPending || deleteAssetMutation.variables === asset.id}
                        onClick={() => setPrimaryMutation.mutate(asset.id)}
                      >
                        {asset.isPrimary ? "Current main cover" : "Set as current cover"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={deleteAssetMutation.variables === asset.id}
                        onClick={() => {
                          void handleDeleteAsset(asset).catch((error) => {
                            window.alert(getErrorMessage(error, "Failed to delete cover, please try again later."));
                          });
                        }}
                      >
                        {deleteAssetMutation.variables === asset.id ? "deleting..." : "deleting"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
