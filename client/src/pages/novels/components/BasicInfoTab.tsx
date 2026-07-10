import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
  return (
    <div className="space-y-5">
      <DirectorTakeoverEntryPanel
        title={t("gen.pages.novels.components.BasicInfoTab.gen_1c2bfa8e")}
        description={t("gen.pages.novels.components.BasicInfoTab.gen_48ee08a7")}
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
      <SectionBlock
        title={t("gen.pages.novels.components.BasicInfoTab.chapterLocationBasicInfo")}
        description={t("gen.pages.novels.components.BasicInfoTab.gen_95e5f769")}
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
          submitLabel={t("gen.pages.novels.components.BasicInfoTab.saveBasicInfo")}
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
        title={t("gen.pages.novels.components.BasicInfoTab.gen_b59a7318")}
        description={t("gen.pages.novels.components.BasicInfoTab.gen_734fe645")}
        meta={t("gen.pages.novels.components.BasicInfoTab.gen_d1de791d")}
      >
        <NovelStyleRecommendationCard novelId={props.novelId} />
      </DetailDisclosure>
    </div>
  );
}
