import type { BasicTabProps } from "./NovelEditView.types";
import NovelBasicInfoForm from "./NovelBasicInfoForm";
import NovelStyleRecommendationCard from "./NovelStyleRecommendationCard";
import NovelWorldUsageCard from "./NovelWorldUsageCard";
import NovelWorldManagerCard from "./NovelWorldManagerCard";
import { BookFramingQuickFillButton } from "./basicInfoForm/BookFramingQuickFillButton";
import CollapsibleSummary from "./CollapsibleSummary";
import NovelCreateTitleQuickFill from "./titleWorkshop/NovelCreateTitleQuickFill";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import { NovelCoverCard } from "./cover/NovelCoverCard";

export default function BasicInfoTab(props: BasicTabProps) {
  return (
    <div className="space-y-4">
      <DirectorTakeoverEntryPanel
        title="让 AI 从当前项目继续接管"
        description="如果基础信息较完整，可以直接从选定步骤开始自动接管，并选择继续已有进度或重跑当前步。"
        entry={props.directorTakeoverEntry}
      />
      <NovelWorldManagerCard
        view={props.novelWorldView}
        syncDiff={props.novelWorldSyncDiff}
        worldOptions={props.worldOptions}
        selectedWorldId={props.basicForm.worldId}
        isLoading={props.isLoadingNovelWorld}
        isImporting={props.isImportingNovelWorld}
        isGenerating={props.isGeneratingNovelWorld}
        isCreatingManual={props.isCreatingManualNovelWorld}
        isSavingToLibrary={props.isSavingNovelWorldToLibrary}
        isLoadingSyncDiff={props.isLoadingNovelWorldSyncDiff}
        isSyncing={props.isSyncingNovelWorld}
        onImport={props.onImportNovelWorld}
        onCreateManual={props.onCreateManualNovelWorld}
        onGenerate={props.onGenerateNovelWorld}
        onSaveToLibrary={props.onSaveNovelWorldToLibrary}
        onSync={props.onSyncNovelWorld}
      />
      <div id="novel-world-usage">
        <NovelWorldUsageCard
          view={props.worldSliceView}
          message={props.worldSliceMessage}
          isRefreshing={props.isRefreshingWorldSlice}
          isSaving={props.isSavingWorldSliceOverrides}
          onRefresh={props.onRefreshWorldSlice}
          onSave={props.onSaveWorldSliceOverrides}
        />
      </div>
      <section className="space-y-4">
        <div>
          <div className="text-lg font-semibold leading-7 text-foreground">书级定位与基本信息</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            继续完善标题、概述、读者与卖点，让后续自动导演和章节生成能稳定继承当前方向。
          </div>
        </div>
        <NovelBasicInfoForm
          basicForm={props.basicForm}
          genreOptions={props.genreOptions}
          storyModeOptions={props.storyModeOptions}
          worldOptions={props.worldOptions}
          sourceNovelOptions={props.sourceNovelOptions}
          sourceKnowledgeOptions={props.sourceKnowledgeOptions}
          sourceNovelBookAnalysisOptions={props.sourceNovelBookAnalysisOptions}
          isLoadingSourceNovelBookAnalyses={props.isLoadingSourceNovelBookAnalyses}
          availableBookAnalysisSections={props.availableBookAnalysisSections}
          onFormChange={props.onFormChange}
          onSubmit={props.onSave}
          isSubmitting={props.isSaving}
          submitLabel="保存基本信息"
          titleQuickFill={(
            <NovelCreateTitleQuickFill
              basicForm={props.basicForm}
              onApplyTitle={(title) => props.onFormChange({ title })}
            />
          )}
          framingQuickFill={(
            <BookFramingQuickFillButton
              basicForm={props.basicForm}
              genreOptions={props.genreOptions}
              onApplySuggestion={props.onFormChange}
            />
          )}
          coverSection={(
            <NovelCoverCard
              novelId={props.novelId}
              basicForm={props.basicForm}
              genreOptions={props.genreOptions}
              storyModeOptions={props.storyModeOptions}
              worldOptions={props.worldOptions}
              worldSliceView={props.worldSliceView}
            />
          )}
          projectQuickStart={props.projectQuickStart}
        />
      </section>

      <details className="group border-t border-border/60 pt-4">
        <summary className="cursor-pointer list-none">
          <CollapsibleSummary
            title="写法建议"
            description="确认本书的叙述口味、表达密度和风格参考，帮助后续章节保持统一。"
            meta="写法参考"
          />
        </summary>

        <div className="mt-4 space-y-4">
          <NovelStyleRecommendationCard novelId={props.novelId} />
        </div>
      </details>
    </div>
  );
}
