import type { BasicTabProps } from "./NovelEditView.types";
import NovelBasicInfoForm from "./NovelBasicInfoForm";
import NovelStyleRecommendationCard from "./NovelStyleRecommendationCard";
import NovelWorldManagerCard from "./NovelWorldManagerCard";
import { BookFramingQuickFillButton } from "./basicInfoForm/BookFramingQuickFillButton";
import NovelCreateTitleQuickFill from "./titleWorkshop/NovelCreateTitleQuickFill";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import { NovelCoverCard } from "./cover/NovelCoverCard";
import { DetailDisclosure, SectionBlock } from "./workspaceShell";

export default function BasicInfoTab(props: BasicTabProps) {
  const hasWorldAssets = Boolean(props.novelWorldView || props.worldSliceView);

  return (
    <div className="space-y-5">
      <DirectorTakeoverEntryPanel
        title="让 AI 从当前项目继续接管"
        description="如果基础信息较完整，可以直接从选定步骤开始自动接管，并选择继续已有进度或重跑当前步。"
        entry={props.directorTakeoverEntry}
      />
      <SectionBlock
        title="书级定位"
        description="先确认这本书面向谁、靠什么吸引读者、前期必须兑现什么，再让后续世界、角色和章节围绕同一组承诺展开。"
      >
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
      </SectionBlock>

      <DetailDisclosure
        title="本书世界"
        description="维护当前小说会使用的世界规则、地点、势力和可注入片段。后续世界地图、势力关系和区域资产也应从这里延展。"
        meta="世界资产"
        defaultOpen={hasWorldAssets}
      >
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
          usageView={props.worldSliceView}
          usageMessage={props.worldSliceMessage}
          isRefreshingWorldSlice={props.isRefreshingWorldSlice}
          isSavingWorldSliceOverrides={props.isSavingWorldSliceOverrides}
          onImport={props.onImportNovelWorld}
          onCreateManual={props.onCreateManualNovelWorld}
          onGenerate={props.onGenerateNovelWorld}
          onSaveToLibrary={props.onSaveNovelWorldToLibrary}
          onSync={props.onSyncNovelWorld}
          onRefreshWorldSlice={props.onRefreshWorldSlice}
          onSaveWorldSliceOverrides={props.onSaveWorldSliceOverrides}
        />
      </DetailDisclosure>

      <DetailDisclosure
        title="写法建议"
        description="确认本书的叙述口味、表达密度和风格参考，帮助后续章节保持统一。"
        meta="写法参考"
      >
        <NovelStyleRecommendationCard novelId={props.novelId} />
      </DetailDisclosure>
    </div>
  );
}
