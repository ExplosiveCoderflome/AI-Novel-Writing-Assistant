import BookAnalysisDetailPanel from "./components/BookAnalysisDetailPanel";
import BookAnalysisSidebar from "./components/BookAnalysisSidebar";
import { useBookAnalysisWorkspace } from "./hooks/useBookAnalysisWorkspace";

export default function BookAnalysisPage() {
  const workspace = useBookAnalysisWorkspace();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <BookAnalysisSidebar
          selectedDocumentId={workspace.selectedDocumentId}
          selectedVersionId={workspace.selectedVersionId}
          keyword={workspace.keyword}
          status={workspace.status}
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
          onLlmConfigChange={workspace.setLlmConfig}
          onCreate={() => void workspace.createAnalysis()}
          onOpenAnalysis={workspace.openAnalysis}
        />

        <div className="min-w-0 space-y-4">
          <BookAnalysisDetailPanel
            selectedAnalysis={workspace.selectedAnalysis}
            novelOptions={workspace.novelOptions}
            selectedNovelId={workspace.selectedNovelId}
            publishFeedback={workspace.publishFeedback}
            lastPublishResult={workspace.lastPublishResult}
            aggregatedEvidence={workspace.aggregatedEvidence}
            pending={{
              copy: workspace.pending.copy,
              rebuild: workspace.pending.rebuild,
              archive: workspace.pending.archive,
              regenerate: workspace.pending.regenerate,
              saveSection: workspace.pending.saveSection,
              publish: workspace.pending.publish,
            }}
            onSelectedNovelChange={workspace.setSelectedNovelId}
            onCopy={() => void workspace.copySelectedAnalysis()}
            onRebuild={workspace.rebuildAnalysis}
            onArchive={workspace.archiveAnalysis}
            onDownload={(format) => void workspace.downloadSelectedAnalysis(format)}
            onPublish={() => void workspace.publishSelectedAnalysis()}
            onRegenerateSection={(section) => workspace.regenerateSection(section.sectionKey)}
            onSaveSection={workspace.saveSection}
            onDraftChange={workspace.updateSectionDraft}
            getSectionDraft={workspace.getSectionDraft}
          />
        </div>
      </div>
    </div>
  );
}
