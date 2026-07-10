import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo, useState } from "react";
import type {
  Character,
  CharacterGender,
  CharacterTimeline,
  CharacterVisibleProfileBatchResult,
  CharacterVisibleProfileField,
  CharacterVisibleProfileSuggestion,
} from "@ai-novel/shared/types/novel";
import type { CharacterResourceLedgerItem } from "@ai-novel/shared/types/characterResource";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import CharacterAssetSidebar from "./CharacterAssetSidebar";
import CharacterFocusSummary from "./CharacterFocusSummary";
import { isProtagonistCharacter } from "./characterAssetWorkspace.helpers";
import { getLastAppearanceChapter } from "./characterPanel.utils";
import SelectControl from "@/components/common/SelectControl";

interface CharacterFormState {
  name: string;
  role: string;
  gender: CharacterGender;
  personality: string;
  background: string;
  development: string;
  appearance: string;
  physique: string;
  attireStyle: string;
  signatureDetail: string;
  voiceTexture: string;
  presenceImpression: string;
  currentState: string;
  currentGoal: string;
}

interface CharacterAssetWorkspaceProps {
  characters: Character[];
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
  onDeleteCharacter: (characterId: string) => void;
  isDeletingCharacter: boolean;
  deletingCharacterId: string;
  selectedCharacter?: Character;
  characterForm: CharacterFormState;
  onCharacterFormChange: (field: keyof CharacterFormState, value: string) => void;
  onSaveCharacter: () => void;
  isSavingCharacter: boolean;
  timelineEvents: CharacterTimeline[];
  onSyncTimeline: () => void;
  isSyncingTimeline: boolean;
  onSyncAllTimeline: () => void;
  isSyncingAllTimeline: boolean;
  onWorldCheck: () => void;
  isCheckingWorld: boolean;
  onGenerateVisibleProfile: (userGuidance?: string) => void;
  isGeneratingVisibleProfile: boolean;
  visibleProfileSuggestion?: CharacterVisibleProfileSuggestion | null;
  onApplyVisibleProfile: () => void;
  isApplyingVisibleProfile: boolean;
  onGenerateBatchVisibleProfiles: (userGuidance?: string) => void;
  isGeneratingBatchVisibleProfiles: boolean;
  batchVisibleProfileResult?: CharacterVisibleProfileBatchResult | null;
  onApplyBatchVisibleProfiles: () => void;
  isApplyingBatchVisibleProfiles: boolean;
  characterResources?: CharacterResourceLedgerItem[];
  pendingCharacterResourceCount?: number;
  onBackfillCharacterResources?: () => void;
  isBackfillingCharacterResources?: boolean;
}

const VISIBLE_PROFILE_FIELDS: Array<{ key: CharacterVisibleProfileField; label: string; placeholder: string }> = [
  { key: "appearance", label: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_17d20844"), placeholder: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_791666ef") },
  { key: "physique", label: t("gen.pages.novels.components.CharacterAssetWorkspace.bodystateBase"), placeholder: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_1290c311") },
  { key: "attireStyle", label: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_53ee6e58"), placeholder: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_a298f99f") },
  { key: "signatureDetail", label: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_6c8bf500"), placeholder: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_40d9e9a9") },
  { key: "voiceTexture", label: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_100ce21f"), placeholder: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_8ba5764f") },
  { key: "presenceImpression", label: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_48e20549"), placeholder: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_e7dd4310") },
];

function getSecretStatus(selectedCharacter?: Character): string {
  if (!selectedCharacter) {
    return t("gen.pages.novels.components.CharacterAssetWorkspace.gen_f61f4cf6");
  }
  if (selectedCharacter.secret?.trim()) {
    return t("gen.pages.novels.components.CharacterAssetWorkspace.gen_0a76e858");
  }
  const runtimeSignal = `${selectedCharacter.currentState ?? ""} ${selectedCharacter.currentGoal ?? ""}`;
  return /秘密|隐瞒|卧底|伪装/.test(runtimeSignal) ? t("gen.pages.novels.components.CharacterAssetWorkspace.gen_57d43adf") : t("gen.pages.novels.components.CharacterAssetWorkspace.gen_aad97619");
}

function getEmotionSignal(selectedCharacter?: Character): string {
  const runtimeSignal = `${selectedCharacter?.currentState ?? ""} ${selectedCharacter?.currentGoal ?? ""}`;
  if (/愤|怒|焦虑|崩溃|绝望/.test(runtimeSignal)) {
    return t("gen.pages.novels.components.CharacterAssetWorkspace.gen_32979568");
  }
  if (/平静|稳|冷静|从容/.test(runtimeSignal)) {
    return t("gen.pages.novels.components.CharacterAssetWorkspace.gen_42f8a02a");
  }
  return t("gen.pages.novels.components.CharacterAssetWorkspace.gen_27b34703");
}

function getResourceDisplayMode(character?: Character): {
  label: string;
  helper: string;
  limit: number;
  shouldShowResource: (item: CharacterResourceLedgerItem) => boolean;
} {
  const roleText = `${character?.role ?? ""} ${character?.castRole ?? ""}`;
  if (isProtagonistCharacter(character)) {
    return {
      label: t("gen.pages.novels.components.CharacterAssetWorkspace.completeCharacterResources"),
      helper: t("gen.pages.novels.components.CharacterAssetWorkspace.mainCharacterShowsItems"),
      limit: 10,
      shouldShowResource: () => true,
    };
  }
  if (/临时|路人|客串|一次性/.test(roleText)) {
    return {
      label: t("gen.pages.novels.components.CharacterAssetWorkspace.tempResource"),
      helper: t("gen.pages.novels.components.CharacterAssetWorkspace.temporaryRoleResources"),
      limit: 5,
      shouldShowResource: (item) => (
        item.narrativeFunction === "promise"
        || item.narrativeFunction === "hidden_card"
        || item.expectedUseEndChapterOrder != null
        || item.status === "transferred"
      ),
    };
  }
  return {
    label: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_fa19d6da"),
    helper: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_f708e71e"),
    limit: 6,
    shouldShowResource: (item) => item.status !== "stale",
  };
}

function getResourceStatusLabel(status: CharacterResourceLedgerItem["status"]): string {
  const labels: Record<CharacterResourceLedgerItem["status"], string> = {
    available: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_ad6b7038"),
    hidden: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_dce5379c"),
    borrowed: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_5d971fd1"),
    transferred: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_e1dc6851"),
    lost: t("gen.pages.novels.components.CharacterAssetWorkspace.lost"),
    consumed: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_67d4508d"),
    damaged: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_a6d66917"),
    destroyed: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_a208527a"),
    stale: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_8c90bea6"),
  };
  return labels[status] ?? status;
}

function getResourceFunctionLabel(value: CharacterResourceLedgerItem["narrativeFunction"]): string {
  const labels: Record<CharacterResourceLedgerItem["narrativeFunction"], string> = {
    tool: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_20dce2c6"),
    clue: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_ad46a96c"),
    weapon: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_44a3d9a4"),
    proof: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_a1619f59"),
    key: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_02b66eb5"),
    cost: t("gen.pages.novels.components.CharacterAssetWorkspace.cost"),
    promise: t("gen.pages.novels.components.CharacterAssetWorkspace.foreshadowing"),
    hidden_card: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_2fe3dee8"),
    constraint: t("gen.pages.novels.components.CharacterAssetWorkspace.gen_df9c9706"),
  };
  return labels[value] ?? value;
}

export default function CharacterAssetWorkspace(props: CharacterAssetWorkspaceProps) {
  const {
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
  const [visibleProfileGuidance, setVisibleProfileGuidance] = useState("");

  const lastAppearanceChapter = useMemo(
    () => getLastAppearanceChapter(timelineEvents),
    [timelineEvents],
  );
  const emotionSignal = getEmotionSignal(selectedCharacter);
  const secretStatus = getSecretStatus(selectedCharacter);
  const selectedCharacterResources = useMemo(
    () => selectedCharacter
      ? characterResources.filter((item) => (
          item.holderCharacterId === selectedCharacter.id
          || item.ownerCharacterId === selectedCharacter.id
        ))
      : [],
    [characterResources, selectedCharacter],
  );
  const resourceDisplayMode = getResourceDisplayMode(selectedCharacter);
  const displayedResources = selectedCharacterResources
    .filter(resourceDisplayMode.shouldShowResource)
    .slice(0, resourceDisplayMode.limit);
  const hasVisibleProfileSuggestionForSelected = Boolean(
    visibleProfileSuggestion
    && selectedCharacter
    && visibleProfileSuggestion.characterId === selectedCharacter.id,
  );
  const applicableVisibleProfileCount = Object.keys(visibleProfileSuggestion?.fields ?? {}).length;
  const batchApplicableCount = batchVisibleProfileResult?.results.filter((item) => item.hasApplicableChanges).length ?? 0;
  const isSelectedProtagonist = isProtagonistCharacter(selectedCharacter);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <CardTitle>{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_08ddf8c7")}</CardTitle>
            <div className="text-sm text-muted-foreground">
              左侧负责切换角色，右侧集中处理当前角色的状态、动机、成长弧和时间线。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{t("gen.pages.novels.components.CharacterAssetWorkspace.characterCountBuilt")}</Badge>
            {selectedCharacter ? <Badge variant="secondary">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_b9687ee8")}</Badge> : null}
            {isSelectedProtagonist ? <Badge variant="outline">{t("gen.pages.novels.components.CharacterAssetWorkspace.mainCharacter")}</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <CharacterAssetSidebar
          characters={characters}
          selectedCharacterId={selectedCharacterId}
          onSelectedCharacterChange={onSelectedCharacterChange}
          onDeleteCharacter={onDeleteCharacter}
          isDeletingCharacter={isDeletingCharacter}
          deletingCharacterId={deletingCharacterId}
        />

        {!selectedCharacter ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
            先从左侧选择一个角色，再进入详细资产编辑。
          </div>
        ) : (
          <div className="space-y-4">
            <CharacterFocusSummary
              selectedCharacter={selectedCharacter}
              lastAppearanceChapter={lastAppearanceChapter}
            />
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_e4b51d5c")}</div>
                <div className="mt-2 text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_a4b217b8")}</div>
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_6fa32883")}</div>
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_1c6ec6a5")}</div>
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_7e4c7897")}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_5d1476ed")}</div>
                <div className="mt-2 text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_7e669142")}</div>
                <div className="text-xs text-muted-foreground">
                  与主角关系：{selectedCharacter.relationToProtagonist || t("gen.pages.novels.components.CharacterAssetWorkspace.gen_cdc447dc")}
                </div>
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_a7dbdb28")}</div>
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_9c5102bf")}</div>
                <div className="text-xs text-muted-foreground">
                  恐惧 / 伤口：{selectedCharacter.fear || selectedCharacter.wound || t("gen.pages.novels.components.CharacterAssetWorkspace.gen_cdc447dc")}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_46b53d8f")}</div>
                <div className="mt-2 text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_70d4a353")}</div>
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_53ee9a25")}</div>
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_5aaa7ea0")}</div>
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_def7afc3")}</div>
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_086a0fa0")}</div>
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-medium">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_39b1a501")}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    补齐角色的外貌、体态、声音和登场记忆点，后续章节会优先带入高辨识信息。
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AiButton
                    size="sm"
                    variant="outline"
                    onClick={() => onGenerateVisibleProfile(visibleProfileGuidance)}
                    disabled={isGeneratingVisibleProfile || !selectedCharacterId}
                  >
                    {isGeneratingVisibleProfile ? t("gen.pages.novels.components.CharacterAssetWorkspace.gen_4d020ba3") : t("gen.pages.novels.components.CharacterAssetWorkspace.expandExternalData")}
                  </AiButton>
                  <AiButton
                    size="sm"
                    variant="outline"
                    onClick={() => onGenerateBatchVisibleProfiles(visibleProfileGuidance)}
                    disabled={isGeneratingBatchVisibleProfiles || characters.length === 0}
                  >
                    {isGeneratingBatchVisibleProfiles ? t("gen.pages.novels.components.CharacterAssetWorkspace.gen_4d020ba3") : t("gen.pages.novels.components.CharacterAssetWorkspace.gen_6b77f64f")}
                  </AiButton>
                </div>
              </div>
              <div className="mt-3">
                <textarea
                  className="min-h-[72px] w-full rounded-md border bg-background p-2 text-sm"
                  placeholder={t("gen.pages.novels.components.CharacterAssetWorkspace.gen_42466b39")}
                  value={visibleProfileGuidance}
                  onChange={(event) => setVisibleProfileGuidance(event.target.value)}
                />
                <div className="mt-1 text-xs text-muted-foreground">
                  留空时按小说设定自动补齐；填写后，AI 会优先按你的倾向生成可写入建议。
                </div>
              </div>
              {isGeneratingVisibleProfile ? (
                <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
                  正在为“{selectedCharacter.name}”整理外貌、体态、声音和登场记忆点。
                </div>
              ) : null}
              {hasVisibleProfileSuggestionForSelected && visibleProfileSuggestion ? (
                <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {applicableVisibleProfileCount > 0
                          ? `已为“${visibleProfileSuggestion.characterName}”生成 ${applicableVisibleProfileCount} 项可写入外显资料`
                          : `“${visibleProfileSuggestion.characterName}”当前没有可写入的外显资料`}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        请先看下面差异，确认后点击保存到角色卡。
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={onApplyVisibleProfile}
                      disabled={isApplyingVisibleProfile || applicableVisibleProfileCount === 0}
                    >
                      {isApplyingVisibleProfile ? t("gen.pages.novels.components.CharacterAssetWorkspace.savingInProgressDotDotDot") : t("gen.pages.novels.components.CharacterAssetWorkspace.saveToCharacterCard")}
                    </Button>
                  </div>
                  {visibleProfileSuggestion.warnings.length > 0 ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900">
                      {visibleProfileSuggestion.warnings.map((warning) => (
                        <div key={warning}>{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_60a7d01d")}</div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                    {VISIBLE_PROFILE_FIELDS.map((field) => {
                      const nextValue = visibleProfileSuggestion.fields[field.key];
                      const skippedReason = visibleProfileSuggestion.skippedFields[field.key];
                      return (
                        <div key={field.key} className="rounded-md border bg-background/80 p-2 text-xs leading-5">
                          <div className="font-medium">{field.label}</div>
                          <div className="text-muted-foreground">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_ac3e07dc")}</div>
                          <div>{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_5c4950a1")}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {!isGeneratingVisibleProfile && !hasVisibleProfileSuggestionForSelected ? (
                <div className="mt-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  点击“AI 补全外显资料”后，会先在这里显示即将保存的差异；确认后再保存到角色卡。
                </div>
              ) : null}
              {batchVisibleProfileResult ? (
                <div className="mt-3 rounded-lg border border-border/70 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium">
                      批量建议：{batchApplicableCount} 个角色可写入
                    </div>
                    <Button
                      size="sm"
                      onClick={onApplyBatchVisibleProfiles}
                      disabled={isApplyingBatchVisibleProfiles || batchApplicableCount === 0}
                    >
                      {isApplyingBatchVisibleProfiles ? t("gen.pages.novels.components.CharacterAssetWorkspace.gen_17f572b3") : t("gen.pages.novels.components.CharacterAssetWorkspace.gen_cdda6020")}
                    </Button>
                  </div>
                  <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
                    {batchVisibleProfileResult.results.map((result) => (
                      <div key={result.characterId} className="rounded-md border bg-muted/10 p-2 text-xs leading-5">
                        <div className="font-medium">{result.characterName}</div>
                        <div className="text-muted-foreground">
                          {result.hasApplicableChanges
                            ? `可写入 ${Object.keys(result.fields).length} 项`
                            : t("gen.pages.novels.components.CharacterAssetWorkspace.gen_33e5c60d")}
                        </div>
                        <div>{VISIBLE_PROFILE_FIELDS.map((field) => result.fields[field.key]).filter(Boolean).join(" / ")}</div>
                      </div>
                    ))}
                    {batchVisibleProfileResult.skippedCharacters.map((item) => (
                      <div key={item.characterId} className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                        {item.characterName}：{item.reason}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {VISIBLE_PROFILE_FIELDS.map((field) => (
                  <div key={field.key} className="rounded-lg border border-border/70 bg-muted/15 p-3">
                    <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
                    <div className="mt-1 text-sm leading-6">{t("gen.pages.novels.components.CharacterAssetWorkspace.characterFieldMissing")}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_4360c49d")}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{resourceDisplayMode.helper}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onBackfillCharacterResources?.()}
                    disabled={isBackfillingCharacterResources || !onBackfillCharacterResources}
                  >
                    {isBackfillingCharacterResources ? t("gen.pages.novels.components.CharacterAssetWorkspace.gen_675eabc7") : t("gen.pages.novels.components.CharacterAssetWorkspace.gen_3b136623")}
                  </Button>
                  <Badge variant="outline">{resourceDisplayMode.label}</Badge>
                  {pendingCharacterResourceCount > 0 ? (
                    <Badge variant="secondary">{t("gen.pages.novels.components.CharacterAssetWorkspace.resourceChangesPending")}</Badge>
                  ) : null}
                </div>
              </div>

              {displayedResources.length > 0 ? (
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {displayedResources.map((resource) => (
                    <div key={resource.id} className="rounded-lg border border-border/70 bg-muted/15 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">{resource.name}</div>
                        <Badge variant={resource.status === "available" || resource.status === "borrowed" ? "default" : "outline"}>
                          {getResourceStatusLabel(resource.status)}
                        </Badge>
                        <Badge variant="secondary">{getResourceFunctionLabel(resource.narrativeFunction)}</Badge>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{resource.summary}</div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <div>{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_7dc32622")}</div>
                        <div>{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_f2654f2b")}</div>
                        {resource.expectedUseEndChapterOrder ? (
                          <div>{t("gen.pages.novels.components.CharacterAssetWorkspace.useWindowChapters")}</div>
                        ) : null}
                        {resource.constraints.length > 0 ? (
                          <div>{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_5fdd6afe")}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  关键道具、线索、身份凭证或底牌会在章节写作后沉淀到这里；临时角色只保留会影响后续章节的资源。
                </div>
              )}
            </div>

            <details className="rounded-xl border p-3" open>
              <summary className="cursor-pointer font-medium">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_935b3c6f")}</summary>
              <div className="mt-3 space-y-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    placeholder={t("gen.pages.novels.components.CharacterAssetWorkspace.gen_10a6f121")}
                    value={characterForm.name}
                    onChange={(event) => onCharacterFormChange("name", event.target.value)}
                  />
                  <Input
                    placeholder={t("gen.pages.novels.components.CharacterAssetWorkspace.gen_22cffcec")}
                    value={characterForm.role}
                    onChange={(event) => onCharacterFormChange("role", event.target.value)}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <SelectControl
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={characterForm.gender}
                    onChange={(event) => onCharacterFormChange("gender", event.target.value)}
                  >
                    <option value="unknown">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_bf22e442")}</option>
                    <option value="male">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_940ec4fe")}</option>
                    <option value="female">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_6e2fb7fd")}</option>
                    <option value="other">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_3a5b7ca6")}</option>
                  </SelectControl>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    placeholder={t("gen.pages.novels.components.CharacterAssetWorkspace.gen_ca7f49bf")}
                    value={characterForm.currentState}
                    onChange={(event) => onCharacterFormChange("currentState", event.target.value)}
                  />
                  <Input
                    placeholder={t("gen.pages.novels.components.CharacterAssetWorkspace.gen_bad43983")}
                    value={characterForm.currentGoal}
                    onChange={(event) => onCharacterFormChange("currentGoal", event.target.value)}
                  />
                </div>
                <textarea
                  className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                  placeholder={t("gen.pages.novels.components.CharacterAssetWorkspace.gen_e3bb2ab7")}
                  value={characterForm.personality}
                  onChange={(event) => onCharacterFormChange("personality", event.target.value)}
                />
                <textarea
                  className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                  placeholder={t("gen.pages.novels.components.CharacterAssetWorkspace.gen_06575dab")}
                  value={characterForm.background}
                  onChange={(event) => onCharacterFormChange("background", event.target.value)}
                />
                <textarea
                  className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                  placeholder={t("gen.pages.novels.components.CharacterAssetWorkspace.gen_6f6c3755")}
                  value={characterForm.development}
                  onChange={(event) => onCharacterFormChange("development", event.target.value)}
                />
                <div className="grid gap-2 md:grid-cols-2">
                  {VISIBLE_PROFILE_FIELDS.map((field) => (
                    <textarea
                      key={field.key}
                      className="min-h-[72px] w-full rounded-md border bg-background p-2 text-sm"
                      placeholder={`${field.label}：${field.placeholder}`}
                      value={characterForm[field.key]}
                      onChange={(event) => onCharacterFormChange(field.key, event.target.value)}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={onSaveCharacter} disabled={isSavingCharacter}>
                    {isSavingCharacter ? t("gen.pages.novels.components.CharacterAssetWorkspace.savingInProgressDotDotDot") : t("gen.pages.novels.components.CharacterAssetWorkspace.gen_保存角色资产_ry70")}
                  </Button>
                  <AiButton size="sm" variant="outline" onClick={onSyncTimeline} disabled={isSyncingTimeline}>
                    {isSyncingTimeline ? t("gen.pages.novels.components.CharacterAssetWorkspace.gen_f787f452") : t("gen.pages.novels.components.CharacterAssetWorkspace.gen_aa696822")}
                  </AiButton>
                  <AiButton
                    size="sm"
                    variant="outline"
                    onClick={onSyncAllTimeline}
                    disabled={isSyncingAllTimeline}
                  >
                    {isSyncingAllTimeline ? t("gen.pages.novels.components.CharacterAssetWorkspace.gen_f787f452") : t("gen.pages.novels.components.CharacterAssetWorkspace.gen_690ac493")}
                  </AiButton>
                  <AiButton size="sm" variant="outline" onClick={onWorldCheck} disabled={isCheckingWorld}>
                    {isCheckingWorld ? t("gen.pages.novels.components.CharacterAssetWorkspace.gen_0410cb00") : t("gen.pages.novels.components.CharacterAssetWorkspace.gen_214d050f")}
                  </AiButton>
                </div>
              </div>
            </details>

            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer font-medium">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_2a80462e")}</summary>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div>{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_df54d417")}</div>
                <div>{t("gen.pages.novels.components.CharacterAssetWorkspace.segmentTransition")}</div>
                <div>{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_1e0d43ff")}</div>
                <div>{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_9f2d1a54")}</div>
                <div>{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_67aad783")}</div>
                <div>{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_4ac0cc5c")}</div>
              </div>
            </details>

            <div className="space-y-2">
              <div className="text-sm font-medium">{t("gen.pages.novels.components.CharacterAssetWorkspace.gen_c716553d")}</div>
              {timelineEvents.length > 0 ? (
                timelineEvents.slice(-12).reverse().map((event) => (
                  <div key={event.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{event.title}</div>
                      <Badge variant="outline">{event.source}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {event.chapterOrder ? `章节 ${event.chapterOrder}` : t("gen.pages.novels.components.CharacterAssetWorkspace.gen_c826b7d2")} ·{" "}
                      {new Date(event.createdAt).toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{event.content}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  暂无事件，先点击“同步角色时间线”。
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
