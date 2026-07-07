import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getNovelChapters } from "@/api/novel/chapters";
import { queryKeys } from "@/api/queryKeys";
import type { PromptCatalogItem } from "@/api/promptWorkbench";
import { cn } from "@/lib/utils";
import { PromptBodyEditor } from "./components/PromptBodyEditor";
import { PromptCatalogSidebar } from "./components/PromptCatalogSidebar";
import { ContextInjectionPanel } from "./components/ContextInjectionPanel";
import { PromptEditorShell } from "./components/PromptEditorShell";
import { PromptRunBar } from "./components/PromptRunBar";
import { usePromptCatalog } from "./hooks/usePromptCatalog";
import { usePromptDraftSlots } from "./hooks/usePromptDraftSlots";
import { usePromptPreview } from "./hooks/usePromptPreview";

export default function PromptWorkbenchPage() {
  const [keyword, setKeyword] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [entrypoint, setEntrypoint] = useState("manual_test");
  const [selectedContextBlockId, setSelectedContextBlockId] = useState<string | null>(null);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState("");

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
  const previewState = usePromptPreview({
    prompt: selectedPrompt,
    entrypoint,
    novelId: slotState.scope === "novel" && slotState.activeNovelId ? slotState.activeNovelId : undefined,
    chapterId: slotState.scope === "novel" && selectedChapterId ? selectedChapterId : undefined,
    previewNovel: activeNovel,
    previewChapter: selectedChapter,
    slotOverrides: slotState.drafts,
  });
  const preview = previewState.preview;

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

  function handleSelectPrompt(prompt: PromptCatalogItem) {
    setSelectedKey(prompt.key);
    setSelectedContextBlockId(null);
  }

  const saveDisabled = !selectedPrompt?.slotSupported
    || slotState.isNovelScopeDisabled
    || !slotState.hasDirtyDrafts
    || slotState.saveMutation.isPending;

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
                {slotState.isNovelScopeDisabled ? (
                  <div className="rounded-md bg-muted/[0.35] px-4 py-3 text-sm text-muted-foreground">
                    选择小说后可设置本书独立的槽位覆盖；未选择小说时仅能查看继承值和生成通用预览。
                  </div>
                ) : null}
                <PromptBodyEditor
                  prompt={selectedPrompt}
                  immersive={immersiveMode}
                  preview={preview}
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
              </div>
            }
            contextPanel={
              <ContextInjectionPanel
                preview={preview}
                selectedBlockId={selectedContextBlockId}
                onSelectBlock={setSelectedContextBlockId}
              />
            }
            runBar={
              <PromptRunBar
                prompt={selectedPrompt}
                estimatedTokens={preview?.context.estimatedInputTokens ?? null}
                dirtyCount={slotState.dirtySlotKeys.length}
                isPreviewPending={previewState.previewMutation.isPending}
                isSavePending={slotState.saveMutation.isPending}
                isSaveSuccess={slotState.saveMutation.isSuccess}
                saveError={slotState.saveError}
                saveDisabled={saveDisabled}
                previewDisabled={!selectedPrompt || previewState.previewMutation.isPending}
                resetDisabled={!slotState.hasDirtyDrafts}
                officialVersionDisabled={!selectedPrompt?.slotSupported || slotState.isNovelScopeDisabled}
                onGeneratePreview={previewState.generatePreview}
                onOpenOfficialVersion={slotState.openOfficialVersionPanel}
                onSave={slotState.saveDrafts}
                onReset={slotState.resetDrafts}
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
