import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, ListChecks, Plus, RefreshCw } from "lucide-react";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import {
  WorkspaceHeader,
  WorkspaceNextAction,
  WorkspaceStateNotice,
} from "@/components/workspace";
import { Button } from "@/components/ui/button";
import BookAnalysisBudgetAdjustDialog from "./components/BookAnalysisBudgetAdjustDialog";
import BookAnalysisCharacterPanel from "./components/BookAnalysisCharacterPanel";
import BookAnalysisCreateDialog from "./components/BookAnalysisCreateDialog";
import BookAnalysisDiagnosisTipBanner from "./components/BookAnalysisDiagnosisTipBanner";
import BookAnalysisDetailPanel from "./components/BookAnalysisDetailPanel";
import BookAnalysisSidebar from "./components/BookAnalysisSidebar";
import BookAnalysisWorkbenchViewTabs from "./components/BookAnalysisWorkbenchViewTabs";
import BookAnalysisWorkspaceToolbar from "./components/BookAnalysisWorkspaceToolbar";
import { useBookAnalysisActiveView } from "./hooks/useBookAnalysisActiveView";
import { useBookAnalysisChapterReader } from "./hooks/useBookAnalysisChapterReader";
import { useBookAnalysisDualPanePreference } from "./hooks/useBookAnalysisDualPanePreference";
import { useBookAnalysisWorkspace } from "./hooks/useBookAnalysisWorkspace";
import {
  resolveBookAnalysisNextAction,
  summarizeBookAnalysisSections,
} from "./bookAnalysisWorkspaceViewModel";
import { formatStage, formatStatus } from "./bookAnalysis.utils";

export default function BookAnalysisPage() {
  const workspace = useBookAnalysisWorkspace();
  const dualPanePreference = useBookAnalysisDualPanePreference();
  const chapterReader = useBookAnalysisChapterReader();
  const { activeView, setActiveView } = useBookAnalysisActiveView();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [budgetDialogMode, setBudgetDialogMode] = useState<"adjust" | "resume" | null>(null);
  const pendingResultFocusIdRef = useRef("");

  const { generatedCharacterCount, candidateCharacterCount } = useMemo(() => {
    let generated = 0;
    let candidate = 0;
    for (const character of workspace.characters) {
      if (character.status === "generated") {
        generated += 1;
      } else {
        candidate += 1;
      }
    }
    return { generatedCharacterCount: generated, candidateCharacterCount: candidate };
  }, [workspace.characters]);

  const handleCreate = async () => {
    try {
      await workspace.createAnalysis();
      setCreateDialogOpen(false);
    } catch {
      // 保持弹窗打开，用户可在错误提示后重试
    }
  };

  const handleCreateDiagnosis = async () => {
    try {
      await workspace.createDiagnosisAnalysis();
      setCreateDialogOpen(false);
    } catch {
      // 保持弹窗打开
    }
  };

  const handleBudgetSubmit = async (nextBudgetTokens: number | null) => {
    if (budgetDialogMode === "resume") {
      if (typeof nextBudgetTokens !== "number" || !Number.isFinite(nextBudgetTokens)) {
        return;
      }
      await workspace.resumeWithBudget(nextBudgetTokens);
      return;
    }
    await workspace.updateBudget(nextBudgetTokens);
  };

  const characterPanelNode = workspace.selectedAnalysis ? (
    <BookAnalysisCharacterPanel
      analysisId={workspace.selectedAnalysis.id}
      characters={workspace.characters}
      disabled={workspace.selectedAnalysis.status === "archived"}
      isLoading={workspace.pending.loadCharacters}
      pending={{
        generate: workspace.pending.generateCharacters,
        identify: workspace.pending.identifyCharacters,
        generateProfile: workspace.pending.generateCharacterProfile,
        generateAll: workspace.pending.generateAllCandidates,
        generatingIds: workspace.pending.generatingCharacterIds,
        create: workspace.pending.createCharacter,
        update: workspace.pending.updateCharacter,
        delete: workspace.pending.deleteCharacter,
      }}
      onIdentify={workspace.identifyCharacters}
      onGenerateProfile={workspace.generateCharacterProfile}
      onGenerateAll={workspace.generateAllCandidates}
      batchSummary={workspace.characterBatchSummary}
      onDismissBatchSummary={workspace.dismissCharacterBatchSummary}
      onCreate={workspace.createCharacter}
      onUpdate={workspace.updateCharacter}
      onDelete={workspace.deleteCharacter}
    />
  ) : null;

  const sectionsViewDualPaneAvailable = activeView === "sections" && dualPanePreference.dualPaneAvailable;
  const sectionSummary = useMemo(
    () => summarizeBookAnalysisSections(workspace.selectedAnalysis),
    [workspace.selectedAnalysis],
  );
  const nextAction = useMemo(
    () => resolveBookAnalysisNextAction({
      analysis: workspace.selectedAnalysis,
      analysesCount: workspace.analyses.length,
    }),
    [workspace.analyses.length, workspace.selectedAnalysis],
  );

  const scrollToResults = () => {
    window.requestAnimationFrame(() => {
      document.getElementById("book-analysis-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const focusResults = () => {
    if (workspace.selectedAnalysis?.id) {
      pendingResultFocusIdRef.current = workspace.selectedAnalysis.id;
    }
    setActiveView("sections");
    if (activeView === "sections") {
      pendingResultFocusIdRef.current = "";
      scrollToResults();
    }
  };

  useEffect(() => {
    const pendingAnalysisId = pendingResultFocusIdRef.current;
    if (
      !pendingAnalysisId
      || activeView !== "sections"
      || workspace.selectedAnalysis?.id !== pendingAnalysisId
    ) {
      return;
    }
    pendingResultFocusIdRef.current = "";
    scrollToResults();
  }, [activeView, workspace.selectedAnalysis?.id]);

  const handlePrimaryAction = () => {
    if (nextAction.action === "create") {
      setCreateDialogOpen(true);
      return;
    }
    if (nextAction.action === "view_results") {
      focusResults();
      return;
    }
    if (nextAction.action === "resume_budget") {
      setBudgetDialogMode("resume");
      return;
    }
    if (nextAction.action === "rebuild" && workspace.selectedAnalysis) {
      workspace.rebuildAnalysis(workspace.selectedAnalysis.id);
      return;
    }
    if (nextAction.action === "copy") {
      void workspace.copySelectedAnalysis();
    }
  };

  return (
    <div className="space-y-4">
      {workspace.selectedAnalysis ? (
        <BookAnalysisBudgetAdjustDialog
          open={budgetDialogMode !== null}
          mode={budgetDialogMode ?? "adjust"}
          analysis={workspace.selectedAnalysis}
          pending={budgetDialogMode === "resume" ? workspace.pending.resumeWithBudget : workspace.pending.updateBudget}
          onOpenChange={(open) => setBudgetDialogMode(open ? (budgetDialogMode ?? "adjust") : null)}
          onSubmit={handleBudgetSubmit}
        />
      ) : null}
      <WorkspaceHeader
        icon={BookOpenText}
        context={workspace.analysisMode === "diagnosis" ? "Manuscript Diagnosis · Original Text and Results Workbench" : "Reference book · Original text and results workbench"}
        title={workspace.selectedAnalysis?.title ?? "Book split analysis"}
        description={workspace.selectedAnalysis
          ? "Read the structure, characters, world, and writing conclusions around the source document; the results can continue to be published to the novel knowledge base or handed over to the creative center for reference."
          : "Select source documents and generate structured book splitting results. After completion, you can directly read the sections, review the original evidence, and organize the character files."}
        meta={workspace.selectedAnalysis ? (
          <>
            <span>source:{workspace.selectedAnalysis.documentTitle} · v{workspace.selectedAnalysis.documentVersionNumber}</span>
            <span>
              stage:{workspace.selectedAnalysis.currentStage
                ? formatStage(workspace.selectedAnalysis.currentStage)
                : workspace.selectedAnalysis.status === "succeeded"
                  ? "The result is readable"
                  : formatStatus(workspace.selectedAnalysis.status)}
            </span>
            <span>schedule:{Math.round(workspace.selectedAnalysis.progress * 100)}%</span>
            <span>scope:{workspace.selectedAnalysis.sourceRange?.label ?? "full text"}</span>
            <span>Planning section:{sectionSummary.readableExpected}/{sectionSummary.expected} Readable</span>
          </>
        ) : null}
        actions={(
          <>
            <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Create a new book
                                </Button>
            {workspace.selectedAnalysis ? (
              <OpenInCreativeHubButton
                bindings={{
                  bookAnalysisId: workspace.selectedAnalysisId || null,
                  knowledgeDocumentIds: workspace.selectedDocumentId ? [workspace.selectedDocumentId] : [],
                }}
                label="Cited in Creative Hub"
              />
            ) : null}
          </>
        )}
      />

      {workspace.selectedAnalysisId && workspace.queryState.detailLoading ? (
        <WorkspaceStateNotice
          loading
          tone="info"
          title="Reading the book opening results"
          description="After the results are loaded, readable sections and original text evidence will be displayed directly."
        />
      ) : workspace.selectedAnalysisId && workspace.queryState.detailError ? (
        <WorkspaceStateNotice
          tone="danger"
          title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
          description={`The source documentation and saved results will not be overwritten. (${workspace.queryState.detailError})`}
          action={(
            <Button type="button" size="sm" variant="outline" onClick={workspace.retryDetail}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Retry details
                              </Button>
          )}
        />
      ) : !workspace.selectedAnalysisId && workspace.queryState.analysesLoading ? (
        <WorkspaceStateNotice
          loading
          tone="info"
          title="Reading open book list"
          description="Existing analysis and recent progress are being confirmed. The next step will be given after the loading is completed."
        />
      ) : !workspace.selectedAnalysisId && workspace.queryState.analysesError ? (
        <WorkspaceStateNotice
          tone="danger"
          title="Unable to read open book list"
          description={`${workspace.queryState.analysesError} Existing source documentation and analysis results will not be modified.`}
          action={(
            <Button type="button" size="sm" variant="outline" onClick={workspace.retryAnalyses}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Reload
                              </Button>
          )}
        />
      ) : (
        <WorkspaceNextAction
          tone={nextAction.tone}
          icon={nextAction.action === "view_results" ? ListChecks : undefined}
          title={nextAction.title}
          description={nextAction.description}
          action={nextAction.action && nextAction.action !== "select" && nextAction.actionLabel ? (
            <Button
              type="button"
              size="sm"
              onClick={handlePrimaryAction}
              disabled={workspace.pending.rebuild || workspace.pending.copy || workspace.pending.resumeWithBudget}
            >
              {nextAction.actionLabel}
            </Button>
          ) : null}
        />
      )}
      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="order-2 min-w-0 xl:order-1">
          <BookAnalysisSidebar
            keyword={workspace.keyword}
            status={workspace.status}
            analyses={workspace.analyses}
            selectedAnalysisId={workspace.selectedAnalysisId}
            loading={workspace.queryState.analysesLoading}
            errorMessage={workspace.queryState.analysesError}
            onKeywordChange={workspace.setKeyword}
            onStatusChange={workspace.setStatus}
            onOpenAnalysis={(analysisId, documentId) => {
              pendingResultFocusIdRef.current = analysisId;
              workspace.openAnalysis(analysisId, documentId);
              setActiveView("sections");
            }}
            onOpenCreateDialog={() => setCreateDialogOpen(true)}
            onRetry={workspace.retryAnalyses}
          />
        </div>

        <div className="order-1 min-w-0 space-y-4 xl:order-2">
          {workspace.analysisMode === "diagnosis" && workspace.selectedAnalysis ? (
            <BookAnalysisDiagnosisTipBanner documentTitle={workspace.selectedAnalysis.documentTitle} />
          ) : null}
          {workspace.selectedAnalysis ? (
            <>
              <BookAnalysisWorkspaceToolbar
                selectedAnalysis={workspace.selectedAnalysis}
                selectedNovelId={workspace.selectedNovelId}
                dualPaneAvailable={sectionsViewDualPaneAvailable}
                isDualPane={dualPanePreference.dualPaneEnabled}
                pending={{
                  copy: workspace.pending.copy,
                  rebuild: workspace.pending.rebuild,
                  archive: workspace.pending.archive,
                  publish: workspace.pending.publish,
                  createStyleProfile: workspace.pending.createStyleProfile,
                  updateBudget: workspace.pending.updateBudget,
                  resumeWithBudget: workspace.pending.resumeWithBudget,
                }}
                onCopy={() => void workspace.copySelectedAnalysis()}
                onRebuild={workspace.rebuildAnalysis}
                onArchive={workspace.archiveAnalysis}
                onPublish={() => void workspace.publishSelectedAnalysis()}
                onCreateStyleProfile={() => void workspace.createStyleProfileFromAnalysis()}
                onDownload={(format) => void workspace.downloadSelectedAnalysis(format)}
                onDualPaneChange={dualPanePreference.setDualPaneEnabled}
                onOpenBudgetAdjust={() => setBudgetDialogMode("adjust")}
                onOpenBudgetResume={() => setBudgetDialogMode("resume")}
              />
              <BookAnalysisWorkbenchViewTabs
                activeView={activeView}
                onActiveViewChange={setActiveView}
                generatedCharacterCount={generatedCharacterCount}
                candidateCharacterCount={candidateCharacterCount}
              />
              {activeView === "sections" ? (
                <div id="book-analysis-results" className="scroll-mt-4">
                  <BookAnalysisDetailPanel
                    analysisMode={workspace.analysisMode}
                    selectedAnalysis={workspace.selectedAnalysis}
                    novelOptions={workspace.novelOptions}
                    documentChapters={workspace.documentChapters}
                    sourceVersionContent={workspace.sourceVersionContent}
                    sourceLoading={workspace.queryState.sourceLoading}
                    sourceError={workspace.queryState.sourceError}
                    chaptersLoading={workspace.queryState.chaptersLoading}
                    chaptersError={workspace.queryState.chaptersError}
                    selectedNovelId={workspace.selectedNovelId}
                    publishFeedback={workspace.publishFeedback}
                    styleProfileFeedback={workspace.styleProfileFeedback}
                    lastPublishResult={workspace.lastPublishResult}
                    aggregatedEvidence={workspace.aggregatedEvidence}
                    optimizingSectionKey={workspace.optimizingSectionKey}
                    isDualPane={dualPanePreference.dualPaneEnabled}
                    currentChapterIndex={chapterReader.currentChapterIndex}
                    chapterHighlightRange={chapterReader.highlightRange}
                    chapterReaderRef={chapterReader.readerRef}
                    rightColumnExtra={dualPanePreference.dualPaneEnabled ? characterPanelNode : null}
                    pending={{
                      regenerate: workspace.pending.regenerate,
                      optimizePreview: workspace.pending.optimizePreview,
                      saveSection: workspace.pending.saveSection,
                      publish: workspace.pending.publish,
                    }}
                    onActiveChapterChange={chapterReader.setCurrentChapterIndex}
                    onSelectChapter={chapterReader.scrollToChapter}
                    onEvidenceJump={chapterReader.scrollToEvidence}
                    onRetrySource={workspace.retrySource}
                    onRetryChapters={workspace.retryChapters}
                    onSelectedNovelChange={workspace.setSelectedNovelId}
                    onPublish={() => void workspace.publishSelectedAnalysis()}
                    onRegenerateSection={(section) => workspace.regenerateSection(section.sectionKey)}
                    onOptimizeSection={(section) => void workspace.optimizeSectionPreview(section)}
                    onApplyOptimizePreview={workspace.applySectionOptimizePreview}
                    onCancelOptimizePreview={workspace.clearSectionOptimizePreview}
                    onSaveSection={workspace.saveSection}
                    onDraftChange={workspace.updateSectionDraft}
                    getSectionDraft={workspace.getSectionDraft}
                  />
                </div>
              ) : (
                characterPanelNode
              )}
            </>
          ) : (
            <WorkspaceStateNotice
              tone="neutral"
              title={workspace.analyses.length > 0 ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "No result of opening the book yet"}
              description={workspace.analyses.length > 0 ? "After selecting an analysis from the left, this will display the source, generation stage, readable results, and recovery action." : "After creating a new book breakdown, AI will organize the source document into readable, publishable, and citationable results."} action={workspace.analyses.length === 0 ? (
                <Button type="button" size="sm" onClick={() => setCreateDialogOpen(true)}>Create a new book</Button>
              ) : null}
            />
          )}
        </div>
      </div>

      <BookAnalysisCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        analysisMode={workspace.analysisMode}
        selectedDocumentId={workspace.selectedDocumentId}
        selectedVersionId={workspace.selectedVersionId}
        selectedDiagnosisNovelId={workspace.selectedDiagnosisNovelId}
        userFocusInstruction={workspace.userFocusInstruction}
        selectedSourceRange={workspace.selectedSourceRange}
        budgetTokens={workspace.budgetTokens}
        analysisPreset={workspace.analysisPreset}
        llmConfig={workspace.llmConfig}
        documentOptions={workspace.documentOptions}
        versionOptions={workspace.versionOptions}
        sourceDocument={workspace.sourceDocument}
        sourceChapters={workspace.sourceChapters}
        sourceChaptersRequested={workspace.sourceChaptersRequested}
        sourceChaptersLoading={workspace.sourceChaptersLoading}
        sourceChaptersError={workspace.sourceChaptersError}
        novelOptions={workspace.novelOptions}
        createPending={workspace.pending.create}
        createDiagnosisPending={workspace.pending.createDiagnosis}
        onModeChange={workspace.setAnalysisMode}
        onSelectDocument={workspace.selectDocument}
        onSelectVersion={workspace.selectVersion}
        onSelectDiagnosisNovel={workspace.setSelectedDiagnosisNovelId}
        onUserFocusInstructionChange={workspace.setUserFocusInstruction}
        onSourceRangeChange={workspace.setSelectedSourceRange}
        onBudgetTokensChange={workspace.setBudgetTokens}
        onRequestSourceChapters={workspace.requestSourceChapters}
        onAnalysisPresetChange={workspace.setAnalysisPreset}
        onLlmConfigChange={workspace.setLlmConfig}
        onCreate={handleCreate}
        onCreateDiagnosis={handleCreateDiagnosis}
      />
    </div>
  );
}
