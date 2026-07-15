import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getNovelChapters } from "@/api/novel/chapters";
import { queryKeys } from "@/api/queryKeys";
import type { PromptCatalogItem } from "@/api/promptWorkbench";
import type { LLMSelectorValue } from "@/components/common/LLMSelector";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useLLMStore } from "@/store/llmStore";
import { AdvancedPromptTemplateEditor } from "./components/AdvancedPromptTemplateEditor";
import { PromptBodyEditor } from "./components/PromptBodyEditor";
import { PromptCatalogSidebar } from "./components/PromptCatalogSidebar";
import { ContextInjectionPanel } from "./components/ContextInjectionPanel";
import { PromptEditorShell } from "./components/PromptEditorShell";
import { PromptRunBar } from "./components/PromptRunBar";
import { usePromptCatalog } from "./hooks/usePromptCatalog";
import { usePromptDraftSlots } from "./hooks/usePromptDraftSlots";
import { usePromptPreview } from "./hooks/usePromptPreview";
import { usePromptTemplateEditor } from "./hooks/usePromptTemplateEditor";

type PromptEditMode = "slots" | "advanced";

export default function PromptWorkbenchPage() {
  const [keyword, setKeyword] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [entrypoint, setEntrypoint] = useState("manual_test");
  const [selectedContextBlockId, setSelectedContextBlockId] = useState<string | null>(null);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [editMode, setEditMode] = useState<PromptEditMode>("slots");
  const globalLlmProvider = useLLMStore((state) => state.provider);
  const globalLlmModel = useLLMStore((state) => state.model);
  const globalLlmTemperature = useLLMStore((state) => state.temperature);
  const globalLlmMaxTokens = useLLMStore((state) => state.maxTokens);
  const [testLlm, setTestLlm] = useState<LLMSelectorValue>(() => ({
    provider: globalLlmProvider,
    model: globalLlmModel,
    temperature: globalLlmTemperature,
    maxTokens: globalLlmMaxTokens,
  }));

  const catalog = usePromptCatalog(keyword);
  const prompts = catalog.prompts;
  const selectedPrompt = useMemo(() => {
    if (prompts.length === 0) {
      return null;
    }
    return prompts.find((item) => item.key === selectedKey) ?? prompts[0] ?? null;
  }, [prompts, selectedKey]);

  const slotState = usePromptDraftSlots(selectedPrompt);
  const activeNovel = useMemo(
    () => slotState.novels.find((novel) => novel.id === slotState.activeNovelId) ?? null,
    [slotState.activeNovelId, slotState.novels],
  );
  const chaptersQuery = useQuery({
    queryKey: queryKeys.novels.chapters(slotState.activeNovelId || "none"),
    queryFn: () => getNovelChapters(slotState.activeNovelId),
    enabled: Boolean(slotState.scope === "novel" && slotState.activeNovelId),
    staleTime: 30_000,
  });
  const chapters = chaptersQuery.data?.data ?? [];
  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedChapterId) ?? null,
    [chapters, selectedChapterId],
  );
  const advancedTemplateSupported = selectedPrompt?.id === "novel.chapter.writer";
  const advancedTemplateEnabled = Boolean(
    advancedTemplateSupported
    && slotState.scope === "novel"
    && slotState.activeNovelId,
  );
  const templateState = usePromptTemplateEditor({
    prompt: selectedPrompt,
    novelId: slotState.scope === "novel" ? slotState.activeNovelId : "",
    chapterId: selectedChapterId,
    entrypoint,
    enabled: advancedTemplateEnabled,
  });
  const activeEditMode: PromptEditMode = editMode === "advanced" && advancedTemplateSupported ? "advanced" : "slots";
  const previewState = usePromptPreview({
    prompt: selectedPrompt,
    entrypoint,
    novelId: slotState.scope === "novel" && slotState.activeNovelId ? slotState.activeNovelId : undefined,
    chapterId: slotState.scope === "novel" && selectedChapterId ? selectedChapterId : undefined,
    previewNovel: activeNovel,
    previewChapter: selectedChapter,
    slotOverrides: slotState.drafts,
    templateDraft: activeEditMode === "advanced" && advancedTemplateEnabled ? templateState.draftTemplate : undefined,
  });
  const preview = previewState.preview;
  const testRunError = previewState.testRunMutation.error instanceof Error
    ? previewState.testRunMutation.error.message
    : null;

  useEffect(() => {
    setSelectedContextBlockId(null);
  }, [preview?.prompt.key, selectedPrompt?.key]);

  useEffect(() => {
    setSelectedChapterId("");
  }, [slotState.activeNovelId]);

  useEffect(() => {
    if (slotState.scope !== "novel" || !slotState.activeNovelId || chapters.length === 0) {
      return;
    }
    if (selectedChapterId && chapters.some((chapter) => chapter.id === selectedChapterId)) {
      return;
    }
    const defaultChapter = chapters.find((chapter) => chapter.content?.trim()) ?? chapters[0];
    setSelectedChapterId(defaultChapter?.id ?? "");
  }, [chapters, selectedChapterId, slotState.activeNovelId, slotState.scope]);

  useEffect(() => {
    if (!immersiveMode) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImmersiveMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [immersiveMode]);

  useEffect(() => {
    if (!advancedTemplateSupported && editMode === "advanced") {
      setEditMode("slots");
    }
  }, [advancedTemplateSupported, editMode]);

  useEffect(() => {
    if (testLlm.provider || !globalLlmProvider) {
      return;
    }
    setTestLlm({
      provider: globalLlmProvider,
      model: globalLlmModel,
      temperature: globalLlmTemperature,
      maxTokens: globalLlmMaxTokens,
    });
  }, [
    globalLlmMaxTokens,
    globalLlmModel,
    globalLlmProvider,
    globalLlmTemperature,
    testLlm.provider,
  ]);

  function handleRunTest() {
    previewState.generateTestRun({
      ...(testLlm.provider ? { provider: testLlm.provider } : {}),
      ...(testLlm.model ? { model: testLlm.model } : {}),
      ...(testLlm.temperature !== undefined ? { temperature: testLlm.temperature } : {}),
      ...(testLlm.maxTokens !== undefined ? { maxTokens: testLlm.maxTokens } : {}),
    });
  }

  function handleSelectPrompt(prompt: PromptCatalogItem) {
    setSelectedKey(prompt.key);
    setSelectedContextBlockId(null);
  }

  const saveDisabled = !selectedPrompt?.slotSupported
    || slotState.isNovelScopeDisabled
    || !slotState.hasDirtyDrafts
    || slotState.saveMutation.isPending;
  const templateSaveError = templateState.saveMutation.error instanceof Error
    ? templateState.saveMutation.error.message
    : templateState.restoreMutation.error instanceof Error
      ? templateState.restoreMutation.error.message
      : templateState.activateMutation.error instanceof Error
        ? templateState.activateMutation.error.message
        : null;
  const isAdvancedMode = activeEditMode === "advanced";
  const effectiveDirtyCount = isAdvancedMode ? (templateState.isDirty ? 1 : 0) : slotState.dirtySlotKeys.length;
  const effectiveSavePending = isAdvancedMode ? templateState.saveMutation.isPending : slotState.saveMutation.isPending;
  const effectiveSaveSuccess = isAdvancedMode ? templateState.saveMutation.isSuccess : slotState.saveMutation.isSuccess;
  const effectiveSaveError = isAdvancedMode ? templateSaveError : slotState.saveError;
  const effectiveSaveDisabled = isAdvancedMode
    ? !advancedTemplateEnabled || !templateState.isDirty || templateState.saveMutation.isPending
    : saveDisabled;
  const effectiveResetDisabled = isAdvancedMode ? !templateState.isDirty : !slotState.hasDirtyDrafts;
  const effectiveOfficialDisabled = isAdvancedMode
    ? !advancedTemplateEnabled || templateState.view?.mode !== "custom" || templateState.restoreMutation.isPending
    : !selectedPrompt?.slotSupported || slotState.isNovelScopeDisabled;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 overflow-hidden bg-[#f5f7fb]",
        immersiveMode && "fixed inset-0 z-50 h-screen bg-[#f3f7f5]",
      )}
    >
      {!immersiveMode ? (
        <div className="flex h-full min-h-0 w-[360px] min-w-[300px] max-w-[420px] shrink-0 overflow-hidden">
          <PromptCatalogSidebar
            keyword={keyword}
            onKeywordChange={setKeyword}
            prompts={prompts}
            selectedKey={selectedPrompt?.key ?? null}
            isLoading={catalog.query.isLoading}
            isFetching={catalog.query.isFetching}
            onSelect={handleSelectPrompt}
            onRefresh={() => void catalog.refetch()}
          />
        </div>
      ) : null}

      <main className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
        {selectedPrompt ? (
          <PromptEditorShell
            prompt={selectedPrompt}
            immersive={immersiveMode}
            onImmersiveChange={setImmersiveMode}
            entrypoint={entrypoint}
            onEntrypointChange={setEntrypoint}
            scope={slotState.scope}
            onScopeChange={slotState.setScope}
            selectedNovelId={slotState.selectedNovelId}
            onNovelChange={slotState.setSelectedNovelId}
            novels={slotState.novels}
            selectedChapterId={selectedChapterId}
            onChapterChange={setSelectedChapterId}
            chapters={chapters.map((chapter) => ({
              id: chapter.id,
              title: chapter.title,
              order: chapter.order,
              hasContent: Boolean(chapter.content?.trim()),
            }))}
            bodyPanel={
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-md border border-[#d7e4e0] bg-white/80 p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[#25443f]">编辑模式</div>
                    <div className="text-xs text-muted-foreground">
                      安全槽位适合稳定调整，高级模板适合本书正文写作自定义。
                    </div>
                  </div>
                  <Tabs value={activeEditMode} onValueChange={(value) => setEditMode(value as PromptEditMode)}>
                    <TabsList className="h-10">
                      <TabsTrigger value="slots" className="px-4">安全槽位</TabsTrigger>
                      <TabsTrigger
                        value="advanced"
                        className="px-4"
                        disabled={!advancedTemplateSupported}
                      >
                        高级模板
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {slotState.isNovelScopeDisabled ? (
                  <div className="rounded-md bg-muted/[0.35] px-4 py-3 text-sm text-muted-foreground">
                    选择小说后可设置本书独立的槽位覆盖；未选择小说时仅能查看继承值和生成通用预览。
                  </div>
                ) : null}
                {isAdvancedMode ? (
                  <AdvancedPromptTemplateEditor
                    templateState={templateState}
                    preview={preview}
                    testRun={previewState.testRun}
                    testRunPending={previewState.testRunMutation.isPending}
                    testRunError={testRunError}
                    disabled={!advancedTemplateEnabled}
                  />
                ) : (
                  <PromptBodyEditor
                    prompt={selectedPrompt}
                    immersive={immersiveMode}
                    preview={preview}
                    testRun={previewState.testRun}
                    testRunPending={previewState.testRunMutation.isPending}
                    testRunError={testRunError}
                    sections={slotState.sections}
                    reconcile={slotState.reconcile}
                    reconcileMap={slotState.reconcileMap}
                    showReconcile={slotState.showReconcile}
                    reconcileLoading={slotState.reconcileQuery.isFetching}
                    reconcilePending={slotState.reconcilePending}
                    disabled={
                      slotState.isNovelScopeDisabled
                      || slotState.saveMutation.isPending
                      || slotState.resetMutation.isPending
                    }
                    onSlotChange={slotState.changeSlotDraft}
                    onSlotReset={slotState.resetSlot}
                    onApplyOfficialSlots={slotState.adoptSlotsByKey}
                    onKeepSlots={slotState.keepSlotsByKey}
                    onContextSelect={setSelectedContextBlockId}
                  />
                )}
              </div>
            }
            contextPanel={
              <ContextInjectionPanel
                preview={preview}
                selectedBlockId={selectedContextBlockId}
                onSelectBlock={setSelectedContextBlockId}
                referenceCatalog={isAdvancedMode ? templateState.references : null}
                onInsertToken={isAdvancedMode ? templateState.insertToken : undefined}
              />
            }
            runBar={
              <PromptRunBar
                prompt={selectedPrompt}
                estimatedTokens={preview?.context.estimatedInputTokens ?? null}
                dirtyCount={effectiveDirtyCount}
                isPreviewPending={previewState.previewMutation.isPending}
                isTestRunPending={previewState.testRunMutation.isPending}
                isSavePending={effectiveSavePending}
                isSaveSuccess={effectiveSaveSuccess}
                saveError={effectiveSaveError}
                saveDisabled={effectiveSaveDisabled}
                previewDisabled={!selectedPrompt || previewState.previewMutation.isPending}
                testRunDisabled={!selectedPrompt || previewState.testRunMutation.isPending}
                testLlm={testLlm}
                onTestLlmChange={setTestLlm}
                resetDisabled={effectiveResetDisabled}
                officialVersionDisabled={effectiveOfficialDisabled}
                officialVersionLabel={isAdvancedMode ? "恢复官方模板" : "官方版本"}
                saveLabel={isAdvancedMode ? "保存为新版本" : "保存覆盖"}
                onGeneratePreview={previewState.generatePreview}
                onRunTest={handleRunTest}
                onOpenOfficialVersion={
                  isAdvancedMode
                    ? () => templateState.restoreMutation.mutate()
                    : slotState.openOfficialVersionPanel
                }
                onSave={
                  isAdvancedMode
                    ? () => templateState.saveMutation.mutate()
                    : slotState.saveDrafts
                }
                onReset={isAdvancedMode ? templateState.resetDraft : slotState.resetDrafts}
              />
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <div className="rounded-md border border-dashed bg-background/80 p-6 text-sm text-muted-foreground">
              请选择一个提示词。
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
