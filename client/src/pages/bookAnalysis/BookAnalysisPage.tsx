import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import BookAnalysisCharacterPanel from "./components/BookAnalysisCharacterPanel";
import BookAnalysisDetailPanel from "./components/BookAnalysisDetailPanel";
import BookAnalysisSidebar from "./components/BookAnalysisSidebar";
import { useBookAnalysisWorkspace } from "./hooks/useBookAnalysisWorkspace";

export default function BookAnalysisPage() {
  const workspace = useBookAnalysisWorkspace();

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
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <BookAnalysisSidebar
          selectedDocumentId={workspace.selectedDocumentId}
          selectedVersionId={workspace.selectedVersionId}
          keyword={workspace.keyword}
          status={workspace.status}
          userFocusInstruction={workspace.userFocusInstruction}
          analysisPreset={workspace.analysisPreset}
          llmConfig={workspace.llmConfig}
          documentOptions={workspace.documentOptions}
          versionOptions={workspace.versionOptions}
          sourceDocument={workspace.sourceDocument}
          analyses={workspace.analyses}
          selectedAnalysisId={workspace.selectedAnalysisId}
          createPending={workspace.pending.create}
          onSelectDocument={workspace.selectDocument}
          onSelectVersion={workspace.selectVersion}
          onKeywordChange={workspace.setKeyword}
          onStatusChange={workspace.setStatus}
          onUserFocusInstructionChange={workspace.setUserFocusInstruction}
          onAnalysisPresetChange={workspace.setAnalysisPreset}
          onLlmConfigChange={workspace.setLlmConfig}
          onCreate={() => void workspace.createAnalysis()}
          onOpenAnalysis={workspace.openAnalysis}
        />

        <div className="min-w-0 space-y-4">
          <BookAnalysisDetailPanel
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
          {workspace.selectedAnalysis ? (
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
