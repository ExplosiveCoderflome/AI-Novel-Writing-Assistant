import i18next from "i18next";
import { useTranslation } from "react-i18next";
import type { BasicTabProps } from "./NovelEditView.types";
import NovelWorldManagerCard from "./NovelWorldManagerCard";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import { SectionBlock } from "./workspaceShell";

export default function WorldSetupTab(props: BasicTabProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <DirectorTakeoverEntryPanel
        title={i18next.t("novels.worldSetupTab.q1qgh9")}
        description={i18next.t("novels.worldSetupTab.mep5xl")}
        entry={props.directorTakeoverEntry}
      />
      <SectionBlock
        title={i18next.t("home.worldPrep")}
        description={i18next.t("novels.worldSetupTab.zcn4c7")}
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
      </SectionBlock>
    </div>
  );
}
