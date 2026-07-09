import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { Brain, Clock3, Eye, Network, Package, ScrollText, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CharacterAssetSidebar from "./CharacterAssetSidebar";
import CharacterFocusSummary from "./CharacterFocusSummary";
import { isProtagonistCharacter } from "./characterAssetWorkspace.helpers";
import { getLastAppearanceChapter } from "./characterPanel.utils";
import CharacterIntelligenceTab from "./characterWorkspace/CharacterIntelligenceTab";
import CharacterOverviewTab from "./characterWorkspace/CharacterOverviewTab";
import CharacterProfileTab from "./characterWorkspace/CharacterProfileTab";
import CharacterRelationsTab from "./characterWorkspace/CharacterRelationsTab";
import CharacterResourceTab from "./characterWorkspace/CharacterResourceTab";
import CharacterTimelineTab from "./characterWorkspace/CharacterTimelineTab";
import CharacterVisibleProfileTab from "./characterWorkspace/CharacterVisibleProfileTab";
import type { CharacterAssetWorkspaceProps } from "./characterWorkspace/characterWorkspace.types";

const WORKSPACE_TABS: Array<{ value: string; label: string; icon: LucideIcon }> = [
  { value: "overview", label: "总览", icon: ScrollText },
  { value: "profile", label: "档案", icon: UserRound },
  { value: "visible", label: "外显", icon: Eye },
  { value: "resources", label: "资源", icon: Package },
  { value: "timeline", label: "时间线", icon: Clock3 },
  { value: "relations", label: "关系", icon: Network },
  { value: "intelligence", label: "智能层", icon: Brain },
];

export default function CharacterAssetWorkspace(props: CharacterAssetWorkspaceProps) {
  const {
    novelId,
    llmProvider,
    llmModel,
    characters,
    selectedCharacterId,
    onSelectedCharacterChange,
    onDeleteCharacter,
    isDeletingCharacter,
    deletingCharacterId,
    selectedCharacter,
    characterForm,
    onCharacterFormChange,
    onSaveCharacter,
    isSavingCharacter,
    timelineEvents,
    onSyncTimeline,
    isSyncingTimeline,
    onSyncAllTimeline,
    isSyncingAllTimeline,
    onWorldCheck,
    isCheckingWorld,
    onGenerateVisibleProfile,
    isGeneratingVisibleProfile,
    visibleProfileSuggestion,
    onApplyVisibleProfile,
    isApplyingVisibleProfile,
    onGenerateBatchVisibleProfiles,
    isGeneratingBatchVisibleProfiles,
    batchVisibleProfileResult,
    onApplyBatchVisibleProfiles,
    isApplyingBatchVisibleProfiles,
    characterResources = [],
    pendingCharacterResourceCount = 0,
    onBackfillCharacterResources,
    isBackfillingCharacterResources = false,
  } = props;
  const lastAppearanceChapter = useMemo(
    () => getLastAppearanceChapter(timelineEvents),
    [timelineEvents],
  );
  const selectedCharacterResources = useMemo(
    () => selectedCharacter
      ? characterResources.filter((item) => (
          item.holderCharacterId === selectedCharacter.id
          || item.ownerCharacterId === selectedCharacter.id
        ))
      : [],
    [characterResources, selectedCharacter],
  );
  const isSelectedProtagonist = isProtagonistCharacter(selectedCharacter);

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-background shadow-sm">
      <CardHeader className="border-b border-border/60 bg-[linear-gradient(180deg,hsl(var(--muted)/0.35)_0%,hsl(var(--background))_100%)]">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <CardTitle>角色资产控制台</CardTitle>
            <div className="text-sm text-muted-foreground">
              左侧切换阵容，右侧按场景查看和维护当前角色，减少长篇表单滚动。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{characters.length} 个已建角色</Badge>
            {selectedCharacter ? <Badge variant="secondary">当前编辑：{selectedCharacter.name}</Badge> : null}
            {isSelectedProtagonist ? <Badge variant="outline">主角</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 bg-[linear-gradient(90deg,hsl(var(--muted)/0.18)_0%,hsl(var(--background))_38%)] p-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="xl:max-h-[calc(100vh-220px)] xl:overflow-y-auto xl:pr-1">
          <CharacterAssetSidebar
            characters={characters}
            selectedCharacterId={selectedCharacterId}
            onSelectedCharacterChange={onSelectedCharacterChange}
            onDeleteCharacter={onDeleteCharacter}
            isDeletingCharacter={isDeletingCharacter}
            deletingCharacterId={deletingCharacterId}
          />
        </aside>

        {!selectedCharacter ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
            先从左侧选择一个角色，再进入档案、外显、资源、时间线和关系维护。
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            <CharacterFocusSummary
              selectedCharacter={selectedCharacter}
              lastAppearanceChapter={lastAppearanceChapter}
            />

            <Tabs defaultValue="overview" className="min-w-0">
              <div className="overflow-x-auto pb-1">
                <TabsList className="h-auto min-w-max justify-start gap-1 rounded-2xl border border-border/70 bg-background/85 p-1.5 shadow-sm">
                  {WORKSPACE_TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className="gap-1.5 rounded-xl px-3 py-2 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {tab.label}
                        {tab.value === "resources" && pendingCharacterResourceCount > 0 ? (
                          <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
                            {pendingCharacterResourceCount}
                          </span>
                        ) : null}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              <TabsContent value="overview" className="mt-4">
                <CharacterOverviewTab
                  selectedCharacter={selectedCharacter}
                  lastAppearanceChapter={lastAppearanceChapter}
                  resourceCount={selectedCharacterResources.length}
                  pendingCharacterResourceCount={pendingCharacterResourceCount}
                />
              </TabsContent>
              <TabsContent value="profile" className="mt-4">
                <CharacterProfileTab
                  characterForm={characterForm}
                  onCharacterFormChange={onCharacterFormChange}
                  onSaveCharacter={onSaveCharacter}
                  isSavingCharacter={isSavingCharacter}
                  onSyncTimeline={onSyncTimeline}
                  isSyncingTimeline={isSyncingTimeline}
                  onSyncAllTimeline={onSyncAllTimeline}
                  isSyncingAllTimeline={isSyncingAllTimeline}
                  onWorldCheck={onWorldCheck}
                  isCheckingWorld={isCheckingWorld}
                />
              </TabsContent>
              <TabsContent value="visible" className="mt-4">
                <CharacterVisibleProfileTab
                  characters={characters}
                  selectedCharacter={selectedCharacter}
                  selectedCharacterId={selectedCharacterId}
                  onGenerateVisibleProfile={onGenerateVisibleProfile}
                  isGeneratingVisibleProfile={isGeneratingVisibleProfile}
                  visibleProfileSuggestion={visibleProfileSuggestion}
                  onApplyVisibleProfile={onApplyVisibleProfile}
                  isApplyingVisibleProfile={isApplyingVisibleProfile}
                  onGenerateBatchVisibleProfiles={onGenerateBatchVisibleProfiles}
                  isGeneratingBatchVisibleProfiles={isGeneratingBatchVisibleProfiles}
                  batchVisibleProfileResult={batchVisibleProfileResult}
                  onApplyBatchVisibleProfiles={onApplyBatchVisibleProfiles}
                  isApplyingBatchVisibleProfiles={isApplyingBatchVisibleProfiles}
                />
              </TabsContent>
              <TabsContent value="resources" className="mt-4">
                <CharacterResourceTab
                  selectedCharacter={selectedCharacter}
                  selectedCharacterResources={selectedCharacterResources}
                  pendingCharacterResourceCount={pendingCharacterResourceCount}
                  onBackfillCharacterResources={onBackfillCharacterResources}
                  isBackfillingCharacterResources={isBackfillingCharacterResources}
                />
              </TabsContent>
              <TabsContent value="timeline" className="mt-4">
                <CharacterTimelineTab
                  timelineEvents={timelineEvents}
                  onSyncTimeline={onSyncTimeline}
                  isSyncingTimeline={isSyncingTimeline}
                  onSyncAllTimeline={onSyncAllTimeline}
                  isSyncingAllTimeline={isSyncingAllTimeline}
                />
              </TabsContent>
              <TabsContent value="relations" className="mt-4">
                <CharacterRelationsTab
                  novelId={novelId}
                  characters={characters}
                  selectedCharacter={selectedCharacter}
                  selectedCharacterId={selectedCharacterId}
                  onSelectedCharacterChange={onSelectedCharacterChange}
                  llmProvider={llmProvider}
                  llmModel={llmModel}
                />
              </TabsContent>
              <TabsContent value="intelligence" className="mt-4">
                <CharacterIntelligenceTab selectedCharacter={selectedCharacter} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
