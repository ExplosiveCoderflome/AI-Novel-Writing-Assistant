import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo, useState } from "react";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function BookAnalysisPage() {
  const workspace = useBookAnalysisWorkspace();
  const dualPanePreference = useBookAnalysisDualPanePreference();
  const chapterReader = useBookAnalysisChapterReader();
  const { activeView, setActiveView } = useBookAnalysisActiveView();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [budgetDialogMode, setBudgetDialogMode] = useState<"adjust" | "resume" | null>(null);

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
      <div className="flex justify-end">
        <OpenInCreativeHubButton
          bindings={{
            bookAnalysisId: workspace.selectedAnalysisId || null,
            knowledgeDocumentIds: workspace.selectedDocumentId ? [workspace.selectedDocumentId] : [],
          }}
          label={t("gen.pages.bookAnalysis.BookAnalysisPage.gen_81021efb")}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <BookAnalysisSidebar
          keyword={workspace.keyword}
          status={workspace.status}
          analyses={workspace.analyses}
          selectedAnalysisId={workspace.selectedAnalysisId}
          onKeywordChange={workspace.setKeyword}
          onStatusChange={workspace.setStatus}
          onOpenAnalysis={workspace.openAnalysis}
          onOpenCreateDialog={() => setCreateDialogOpen(true)}
        />

        <div className="min-w-0 space-y-4">
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
                <BookAnalysisDetailPanel
                  analysisMode={workspace.analysisMode}
                  selectedAnalysis={workspace.selectedAnalysis}
                  novelOptions={workspace.novelOptions}
                  documentChapters={workspace.documentChapters}
                  sourceVersionContent={workspace.sourceVersionContent}
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
              ) : (
                characterPanelNode
              )}
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t("gen.pages.bookAnalysis.BookAnalysisPage.gen_d150be05")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                请先在左侧选择一个分析，或从知识文档创建新分析。
              </CardContent>
            </Card>
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
