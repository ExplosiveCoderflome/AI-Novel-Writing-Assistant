import type { BasicTabProps } from "./NovelEditView.types";
import NovelWorldManagerCard from "./NovelWorldManagerCard";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import { SectionBlock } from "./workspaceShell";

export default function WorldSetupTab(props: BasicTabProps) {
  return (
    <div className="space-y-5">
      <DirectorTakeoverEntryPanel
        title="让 AI 完成本书世界观"
        description="先确定世界规则、势力和关键约束，再让角色、卷规划与章节生产围绕同一份世界观继续推进。"
        entry={props.directorTakeoverEntry}
      />
      <SectionBlock
        title="世界观准备"
        description="这里维护本书实际使用的世界观。生成、检查和确认世界观时，AI 会以这些资产为依据。"
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
