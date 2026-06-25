import { useState } from "react";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import BookAnalysisCharacterPanel from "./components/BookAnalysisCharacterPanel";
import BookAnalysisCreateDialog from "./components/BookAnalysisCreateDialog";
import BookAnalysisDiagnosisTipBanner from "./components/BookAnalysisDiagnosisTipBanner";
import BookAnalysisDetailPanel from "./components/BookAnalysisDetailPanel";
import BookAnalysisSidebar from "./components/BookAnalysisSidebar";
import { useBookAnalysisChapterReader } from "./hooks/useBookAnalysisChapterReader";
import { useBookAnalysisDualPanePreference } from "./hooks/useBookAnalysisDualPanePreference";
import { useBookAnalysisWorkspace } from "./hooks/useBookAnalysisWorkspace";

export default function BookAnalysisPage() {
  const workspace = useBookAnalysisWorkspace();
  const dualPanePreference = useBookAnalysisDualPanePreference();
  const chapterReader = useBookAnalysisChapterReader();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

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

  const characterPanelNode = workspace.selectedAnalysis ? (
    <BookAnalysisCharacterPanel
      analysisId={workspace.selectedAnalysis.id}
      characters={workspace.characters}
      disabled={workspace.selectedAnalysis.status === "archived"}
      isLoading={workspace.pending.loadCharacters}
      pending={{
        generate: workspace.pending.generateCharacters,
        create: workspace.pending.createCharacter,
        update: workspace.pending.updateCharacter,
        delete: workspace.pending.deleteCharacter,
      }}
      onGenerate={workspace.generateCharacters}
      onCreate={workspace.createCharacter}
      onUpdate={workspace.updateCharacter}
      onDelete={workspace.deleteCharacter}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <OpenInCreativeHubButton
          bindings={{
            bookAnalysisId: workspace.selectedAnalysisId || null,
            knowledgeDocumentIds: workspace.selectedDocumentId ? [workspace.selectedDocumentId] : [],
          }}
          label="拆书结果发往创作中枢"
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
            dualPaneAvailable={dualPanePreference.dualPaneAvailable}
            isDualPane={dualPanePreference.dualPaneEnabled}
            currentChapterIndex={chapterReader.currentChapterIndex}
            chapterHighlightRange={chapterReader.highlightRange}
            chapterReaderRef={chapterReader.readerRef}
            rightColumnExtra={dualPanePreference.dualPaneEnabled ? characterPanelNode : null}
            pending={{
              copy: workspace.pending.copy,
              rebuild: workspace.pending.rebuild,
              archive: workspace.pending.archive,
              regenerate: workspace.pending.regenerate,
              optimizePreview: workspace.pending.optimizePreview,
              saveSection: workspace.pending.saveSection,
              publish: workspace.pending.publish,
              createStyleProfile: workspace.pending.createStyleProfile,
            }}
            onDualPaneChange={dualPanePreference.setDualPaneEnabled}
            onActiveChapterChange={chapterReader.setCurrentChapterIndex}
            onSelectChapter={chapterReader.scrollToChapter}
            onEvidenceJump={chapterReader.scrollToEvidence}
            onSelectedNovelChange={workspace.setSelectedNovelId}
            onCopy={() => void workspace.copySelectedAnalysis()}
            onRebuild={workspace.rebuildAnalysis}
            onArchive={workspace.archiveAnalysis}
            onDownload={(format) => void workspace.downloadSelectedAnalysis(format)}
            onPublish={() => void workspace.publishSelectedAnalysis()}
            onCreateStyleProfile={() => void workspace.createStyleProfileFromAnalysis()}
            onRegenerateSection={(section) => workspace.regenerateSection(section.sectionKey)}
            onOptimizeSection={(section) => void workspace.optimizeSectionPreview(section)}
            onApplyOptimizePreview={workspace.applySectionOptimizePreview}
            onCancelOptimizePreview={workspace.clearSectionOptimizePreview}
            onSaveSection={workspace.saveSection}
            onDraftChange={workspace.updateSectionDraft}
            getSectionDraft={workspace.getSectionDraft}
          />
          {!dualPanePreference.dualPaneEnabled && characterPanelNode}
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
        onRequestSourceChapters={workspace.requestSourceChapters}
        onAnalysisPresetChange={workspace.setAnalysisPreset}
        onLlmConfigChange={workspace.setLlmConfig}
        onCreate={handleCreate}
        onCreateDiagnosis={handleCreateDiagnosis}
      />
    </div>
  );
}
