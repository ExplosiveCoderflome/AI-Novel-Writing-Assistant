import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type {
  BaseCharacter,
  Character,
  CharacterCastRole,
  CharacterGender,
  CharacterTimeline,
  CharacterVisibleProfileBatchResult,
  CharacterVisibleProfileSuggestion,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerateInput,
  SupplementalCharacterGenerationMode,
  SupplementalCharacterGenerationResult,
} from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { CharacterResourceLedgerItem } from "@ai-novel/shared/types/characterResource";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import CharacterAssetWorkspace from "./CharacterAssetWorkspace";
import CharacterDiagnosticsSection from "./CharacterDiagnosticsSection";
import type { QuickCharacterCreatePayload } from "./characterPanel.utils";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import { StatusRail, StepActionBar, StepHero } from "./workspaceShell";
import SelectControl from "@/components/common/SelectControl";

interface QuickCharacterFormState {
  name: string;
  role: string;
}

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

const CAST_ROLE_LABELS: Record<CharacterCastRole, string> = {
  protagonist: t("gen.pages.novels.components.NovelCharacterPanel.mainCharacter"),
  antagonist: t("gen.pages.novels.components.NovelCharacterPanel.mainEnemy"),
  ally: t("gen.pages.novels.components.NovelCharacterPanel.gen_9669fc43"),
  foil: t("gen.pages.novels.components.NovelCharacterPanel.gen_d7fc88ac"),
  mentor: t("gen.pages.novels.components.NovelCharacterPanel.gen_d62518be"),
  love_interest: t("gen.pages.novels.components.NovelCharacterPanel.gen_65c52a7e"),
  pressure_source: t("gen.pages.novels.components.NovelCharacterPanel.gen_7aa91c6c"),
  catalyst: t("gen.pages.novels.components.NovelCharacterPanel.gen_f57197c6"),
};
const CHARACTER_GENDER_LABELS: Record<CharacterGender, string> = {
  male: t("gen.pages.novels.components.NovelCharacterPanel.gen_36a4908a"),
  female: t("gen.pages.novels.components.NovelCharacterPanel.gen_87c835a6"),
  other: t("gen.pages.novels.components.NovelCharacterPanel.gen_0d98c747"),
  unknown: t("gen.pages.novels.components.NovelCharacterPanel.gen_1622dc9b"),
};
const SUPPLEMENTAL_MODE_LABELS: Record<SupplementalCharacterGenerationMode, string> = {
  auto: t("gen.pages.novels.components.NovelCharacterPanel.aiJudging"),
  linked: t("gen.pages.novels.components.NovelCharacterPanel.gen_898bbf92"),
  independent: t("gen.pages.novels.components.NovelCharacterPanel.gen_db9b906f"),
};

function getCastRoleLabel(castRole?: CharacterCastRole | "auto" | null): string {
  if (!castRole || castRole === "auto") {
    return t("gen.pages.novels.components.NovelCharacterPanel.aiJudging");
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return t("gen.pages.novels.components.NovelCharacterPanel.gen_1622dc9b");
  }
  return CHARACTER_GENDER_LABELS[gender] ?? gender;
}

function getSupplementalRelationLabel(
  candidate: SupplementalCharacterCandidate,
  relation: SupplementalCharacterCandidate["relations"][number],
): string {
  if (relation.sourceName === candidate.name) {
    return relation.targetName;
  }
  if (relation.targetName === candidate.name) {
    return relation.sourceName;
  }
  return `${relation.sourceName} -> ${relation.targetName}`;
}

interface NovelCharacterPanelProps {
  novelId: string;
  llmProvider?: LLMProvider;
  llmModel?: string;
  characterMessage: string;
  quickCharacterForm: QuickCharacterFormState;
  onQuickCharacterFormChange: (field: keyof QuickCharacterFormState, value: string) => void;
  onQuickCreateCharacter: (payload: QuickCharacterCreatePayload) => void;
  isQuickCreating: boolean;
  onGenerateSupplementalCharacters: (payload: SupplementalCharacterGenerateInput) => Promise<{
    data?: SupplementalCharacterGenerationResult;
    message?: string;
  }>;
  isGeneratingSupplementalCharacters: boolean;
  onApplySupplementalCharacter: (candidate: SupplementalCharacterCandidate) => Promise<{
    data?: { character?: Character; relationCount?: number };
    message?: string;
  }>;
  isApplyingSupplementalCharacter: boolean;
  characters: Character[];
  coreCharacterCount: number;
  baseCharacters: BaseCharacter[];
  selectedBaseCharacterId: string;
  onSelectedBaseCharacterChange: (id: string) => void;
  selectedBaseCharacter?: BaseCharacter;
  importedBaseCharacterIds: Set<string>;
  onImportBaseCharacter: () => void;
  isImportingBaseCharacter: boolean;
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
  onDeleteCharacter: (characterId: string) => void;
  isDeletingCharacter: boolean;
  deletingCharacterId: string;
  onSyncTimeline: () => void;
  isSyncingTimeline: boolean;
  onSyncAllTimeline: () => void;
  isSyncingAllTimeline: boolean;
  onEvolveCharacter: () => void;
  isEvolvingCharacter: boolean;
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
  onWorldCheck: () => void;
  isCheckingWorld: boolean;
  selectedCharacter?: Character;
  characterResources?: CharacterResourceLedgerItem[];
  pendingCharacterResourceCount?: number;
  onBackfillCharacterResources?: () => void;
  isBackfillingCharacterResources?: boolean;
  characterForm: CharacterFormState;
  onCharacterFormChange: (field: keyof CharacterFormState, value: string) => void;
  onSaveCharacter: () => void;
  isSavingCharacter: boolean;
  timelineEvents: CharacterTimeline[];
  directorTakeoverEntry?: ReactNode;
}

export default function NovelCharacterPanel(props: NovelCharacterPanelProps) {
  const {
    novelId,
    llmProvider,
    llmModel,
    characterMessage,
    quickCharacterForm,
    onQuickCharacterFormChange,
    onQuickCreateCharacter,
    isQuickCreating,
    onGenerateSupplementalCharacters,
    isGeneratingSupplementalCharacters,
    onApplySupplementalCharacter,
    isApplyingSupplementalCharacter,
    characters,
    coreCharacterCount,
    baseCharacters,
    selectedBaseCharacterId,
    onSelectedBaseCharacterChange,
    selectedBaseCharacter,
    importedBaseCharacterIds,
    onImportBaseCharacter,
    isImportingBaseCharacter,
    selectedCharacterId,
    onSelectedCharacterChange,
    onDeleteCharacter,
    isDeletingCharacter,
    deletingCharacterId,
    onSyncTimeline,
    isSyncingTimeline,
    onSyncAllTimeline,
    isSyncingAllTimeline,
    onEvolveCharacter,
    isEvolvingCharacter,
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
    onWorldCheck,
    isCheckingWorld,
    selectedCharacter,
    characterResources = [],
    pendingCharacterResourceCount = 0,
    onBackfillCharacterResources,
    isBackfillingCharacterResources = false,
    characterForm,
    onCharacterFormChange,
    onSaveCharacter,
    isSavingCharacter,
    timelineEvents,
    directorTakeoverEntry,
  } = props;

  const [isCharacterEntryOpen, setIsCharacterEntryOpen] = useState(false);
  const [isSupplementalCharacterOpen, setIsSupplementalCharacterOpen] = useState(false);
  const [relationToProtagonist, setRelationToProtagonist] = useState("");
  const [storyFunction, setStoryFunction] = useState("");
  const [wizardKeywords, setWizardKeywords] = useState("");
  const [autoGenerateProfile, setAutoGenerateProfile] = useState(true);
  const [supplementalMode, setSupplementalMode] = useState<SupplementalCharacterGenerationMode>("auto");
  const [supplementalAnchorIds, setSupplementalAnchorIds] = useState<string[]>([]);
  const [supplementalTargetRole, setSupplementalTargetRole] = useState<CharacterCastRole | "auto">("auto");
  const [supplementalCount, setSupplementalCount] = useState<"auto" | "1" | "2" | "3">("auto");
  const [supplementalPrompt, setSupplementalPrompt] = useState("");
  const [supplementalUseWorldContext, setSupplementalUseWorldContext] = useState(true);
  const [supplementalStatusMessage, setSupplementalStatusMessage] = useState("");
  const [supplementalResult, setSupplementalResult] = useState<SupplementalCharacterGenerationResult | null>(null);
  const previousQuickCreating = useRef(isQuickCreating);

  useEffect(() => {
    if (previousQuickCreating.current && !isQuickCreating && !quickCharacterForm.name.trim()) {
      setIsCharacterEntryOpen(false);
      setRelationToProtagonist("");
      setStoryFunction("");
      setWizardKeywords("");
      setAutoGenerateProfile(true);
    }
    previousQuickCreating.current = isQuickCreating;
  }, [isQuickCreating, quickCharacterForm.name]);

  const handleQuickCreate = () => {
    const payload: QuickCharacterCreatePayload = {
      name: quickCharacterForm.name,
      role: quickCharacterForm.role,
      relationToProtagonist,
      storyFunction,
      keywords: wizardKeywords,
      autoGenerateProfile,
    };
    onQuickCreateCharacter(payload);
  };

  const handleOpenSupplementalDialog = () => {
    setIsSupplementalCharacterOpen(true);
    if (selectedCharacterId && supplementalAnchorIds.length === 0) {
      setSupplementalAnchorIds([selectedCharacterId]);
    }
  };

  const toggleSupplementalAnchor = (characterId: string) => {
    setSupplementalAnchorIds((prev) =>
      prev.includes(characterId)
        ? prev.filter((item) => item !== characterId)
        : [...prev, characterId],
    );
  };

  const handleGenerateSupplementalCharacters = async () => {
    if (supplementalMode === "linked" && characters.length === 0) {
      setSupplementalStatusMessage(t("gen.pages.novels.components.NovelCharacterPanel.gen_e0c589f6"));
      return;
    }

    try {
      const response = await onGenerateSupplementalCharacters({
        mode: supplementalMode,
        anchorCharacterIds: supplementalMode === "independent" ? [] : supplementalAnchorIds,
        targetCastRole: supplementalTargetRole,
        count: supplementalCount === "auto" ? undefined : Number(supplementalCount),
        userPrompt: supplementalPrompt.trim() || undefined,
        useWorldContext: supplementalUseWorldContext,
        worldFocusHints: supplementalUseWorldContext
          ? { forceCompliance: true }
          : undefined,
      });
      setSupplementalResult(response.data ?? null);
      setSupplementalStatusMessage(response.message ?? t("gen.pages.novels.components.NovelCharacterPanel.gen_a2e06232"));
    } catch (error) {
      setSupplementalStatusMessage(error instanceof Error ? error.message : t("gen.pages.novels.components.NovelCharacterPanel.gen_c7b0928b"));
    }
  };

  const handleApplySupplementalCharacter = async (candidate: SupplementalCharacterCandidate) => {
    try {
      const response = await onApplySupplementalCharacter(candidate);
      const createdName = response.data?.character?.name ?? candidate.name;
      const relationCount = response.data?.relationCount ?? 0;
      setSupplementalResult((prev) => prev
        ? {
          ...prev,
          candidates: prev.candidates.filter((item) => item.name !== candidate.name),
        }
        : prev);
      setSupplementalStatusMessage(
        response.message
        ?? `${createdName} 已加入当前小说${relationCount > 0 ? `，并同步 ${relationCount} 条关系` : ""}。`,
      );
    } catch (error) {
      setSupplementalStatusMessage(error instanceof Error ? error.message : t("gen.pages.novels.components.NovelCharacterPanel.gen_e113be50"));
    }
  };

  return (
    <div className="space-y-5">
      <DirectorTakeoverEntryPanel
        title={t("gen.pages.novels.components.NovelCharacterPanel.takeoverFromRolePreparation")}
        description={t("gen.pages.novels.components.NovelCharacterPanel.aiCheckCharacterAssets")}
        entry={directorTakeoverEntry}
      />
      {characterMessage ? <div className="text-sm text-muted-foreground">{characterMessage}</div> : null}

      <StepHero
        eyebrow={t("gen.pages.novels.components.NovelCharacterPanel.gen_ca1588b6")}
        title={t("gen.pages.novels.components.NovelCharacterPanel.gen_3ed577c6")}
        description={t("gen.pages.novels.components.NovelCharacterPanel.gen_05a5ce48")}
      >
        <StatusRail
          items={[
            { label: t("gen.pages.novels.components.NovelCharacterPanel.gen_4ffb3d3a"), value: characters.length, description: t("gen.pages.novels.components.NovelCharacterPanel.gen_db98804b"), tone: characters.length > 0 ? "success" : "warning" },
            { label: t("gen.pages.novels.components.NovelCharacterPanel.gen_992862b2"), value: coreCharacterCount, description: t("gen.pages.novels.components.NovelCharacterPanel.gen_ac0fda50"), tone: coreCharacterCount > 0 ? "success" : "warning" },
            { label: t("gen.pages.novels.components.NovelCharacterPanel.gen_49f9d850"), value: selectedCharacter?.name ?? t("gen.pages.novels.components.NovelCharacterPanel.gen_9624995c"), description: selectedCharacter?.role || `${baseCharacters.length} 个基础角色可导入`, tone: selectedCharacter ? "info" : "neutral" },
          ]}
        />
        <StepActionBar
          className="mt-4 bg-background/70"
          label={t("gen.pages.novels.components.NovelCharacterPanel.gen_838de0b1")}
          description={t("gen.pages.novels.components.NovelCharacterPanel.gen_429e3e2a")}
          actions={(
            <>
            <Button onClick={() => setIsCharacterEntryOpen(true)}>{t("gen.pages.novels.components.NovelCharacterPanel.gen_098d06b1")}</Button>
            <AiButton variant="outline" onClick={handleOpenSupplementalDialog}>
              补充角色
            </AiButton>
            <AiButton
              variant="secondary"
              onClick={onEvolveCharacter}
              disabled={isEvolvingCharacter || !selectedCharacterId}
            >
              {isEvolvingCharacter ? t("gen.pages.novels.components.NovelCharacterPanel.gen_7e8da796") : t("gen.pages.novels.components.NovelCharacterPanel.aiEvolvingCurrentState")}
            </AiButton>
            <AiButton
              variant="outline"
              onClick={() => onGenerateVisibleProfile()}
              disabled={isGeneratingVisibleProfile || !selectedCharacterId}
            >
              {isGeneratingVisibleProfile ? t("gen.pages.novels.components.NovelCharacterPanel.gen_4d020ba3") : t("gen.pages.novels.components.NovelCharacterPanel.expandExternalData")}
            </AiButton>
            </>
          )}
        />
      </StepHero>

      <Dialog open={isCharacterEntryOpen} onOpenChange={setIsCharacterEntryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("gen.pages.novels.components.NovelCharacterPanel.gen_098d06b1")}</DialogTitle>
            <DialogDescription>
              只有在新建角色或从基础角色库导入时才需要打开这里。日常维护请直接使用角色资产工作台。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="space-y-3 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="font-medium">{t("gen.pages.novels.components.NovelCharacterPanel.gen_433d87d0")}</div>
                <div className="text-xs text-muted-foreground">
                  适合临时补一个新人物占位，再交给下方工作台慢慢打磨。
                </div>
              </div>
              <Input
                placeholder={t("gen.pages.novels.components.NovelCharacterPanel.gen_85c3b8ab")}
                value={quickCharacterForm.name}
                onChange={(event) => onQuickCharacterFormChange("name", event.target.value)}
              />
              <SelectControl
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={quickCharacterForm.role}
                onChange={(event) => onQuickCharacterFormChange("role", event.target.value)}
              >
                <option value={t("gen.pages.novels.components.NovelCharacterPanel.mainCharacter")}>{t("gen.pages.novels.components.NovelCharacterPanel.mainCharacter")}</option>
                <option value={t("gen.pages.novels.components.NovelCharacterPanel.gen_f14665fc")}>{t("gen.pages.novels.components.NovelCharacterPanel.gen_f14665fc")}</option>
                <option value={t("gen.pages.novels.components.NovelCharacterPanel.gen_27dd76d8")}>{t("gen.pages.novels.components.NovelCharacterPanel.gen_27dd76d8")}</option>
                <option value={t("gen.pages.novels.components.NovelCharacterPanel.gen_d62518be")}>{t("gen.pages.novels.components.NovelCharacterPanel.gen_d62518be")}</option>
                <option value={t("gen.pages.novels.components.NovelCharacterPanel.gen_d56d71b4")}>{t("gen.pages.novels.components.NovelCharacterPanel.gen_d56d71b4")}</option>
                <option value={t("gen.pages.novels.components.NovelCharacterPanel.gen_813bdd02")}>{t("gen.pages.novels.components.NovelCharacterPanel.gen_813bdd02")}</option>
              </SelectControl>
              <Input
                placeholder={t("gen.pages.novels.components.NovelCharacterPanel.relationWithProtagonistDetail")}
                value={relationToProtagonist}
                onChange={(event) => setRelationToProtagonist(event.target.value)}
              />
              <Input
                placeholder={t("gen.pages.novels.components.NovelCharacterPanel.gen_80ee2781")}
                value={storyFunction}
                onChange={(event) => setStoryFunction(event.target.value)}
              />
              <Input
                placeholder={t("gen.pages.novels.components.NovelCharacterPanel.gen_4c09eaa7")}
                value={wizardKeywords}
                onChange={(event) => setWizardKeywords(event.target.value)}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoGenerateProfile}
                  onChange={(event) => setAutoGenerateProfile(event.target.checked)}
                />
                自动补齐性格、背景、成长弧和当前状态
              </label>
              <AiButton onClick={handleQuickCreate} disabled={isQuickCreating || !quickCharacterForm.name.trim()}>
                {isQuickCreating ? t("gen.pages.novels.components.NovelCharacterPanel.gen_4d020ba3") : t("gen.pages.novels.components.NovelCharacterPanel.aiGenerateCharacterSheet")}
              </AiButton>
            </div>

            <div className="space-y-3 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="font-medium">{t("gen.pages.novels.components.NovelCharacterPanel.importFromBaseCharacterLibrary")}</div>
                <div className="text-xs text-muted-foreground">
                  适合快速引入成熟模板，再按当前小说需求继续微调。
                </div>
              </div>
              {baseCharacters.length > 0 ? (
                <>
                  <SelectControl
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={selectedBaseCharacterId}
                    onChange={(event) => onSelectedBaseCharacterChange(event.target.value)}
                  >
                    {baseCharacters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}（{character.role}）
                      </option>
                    ))}
                  </SelectControl>
                  {selectedBaseCharacter ? (
                    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{selectedBaseCharacter.name}</span>
                        <Badge variant={importedBaseCharacterIds.has(selectedBaseCharacter.id) ? "outline" : "secondary"}>
                          {importedBaseCharacterIds.has(selectedBaseCharacter.id) ? t("gen.pages.novels.components.NovelCharacterPanel.gen_998d1568") : t("gen.pages.novels.components.NovelCharacterPanel.gen_92610e5f")}
                        </Badge>
                      </div>
                      <div className="line-clamp-3 text-xs text-muted-foreground">
                        性格：{selectedBaseCharacter.personality || t("gen.pages.novels.components.NovelCharacterPanel.gen_f61f4cf6")}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={onImportBaseCharacter}
                      disabled={
                        isImportingBaseCharacter
                        || !selectedBaseCharacter
                        || importedBaseCharacterIds.has(selectedBaseCharacter.id)
                      }
                    >
                      {isImportingBaseCharacter ? t("gen.pages.novels.components.NovelCharacterPanel.gen_763476f8") : t("gen.pages.novels.components.NovelCharacterPanel.gen_06a188ce")}
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/base-characters">{t("gen.pages.novels.components.NovelCharacterPanel.gen_c8ac8a1b")}</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  基础角色库为空，请先创建。
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSupplementalCharacterOpen} onOpenChange={setIsSupplementalCharacterOpen}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-6 pb-0 pt-6">
            <DialogTitle>{t("gen.pages.novels.components.NovelCharacterPanel.gen_d8d10894")}</DialogTitle>
            <DialogDescription>
              适合在已有角色系统基础上补一个缺位人物。你可以指定“从现有关系衍生”或“生成相对独立角色”，也可以直接交给 AI 判断。
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 pb-6 pt-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)] xl:overflow-hidden">
            <div className="space-y-4 rounded-2xl border p-4 xl:min-h-0 xl:overflow-y-auto">
              <div className="space-y-1">
                <div className="font-medium">{t("gen.pages.novels.components.NovelCharacterPanel.gen_620500d9")}</div>
                <div className="text-xs text-muted-foreground">
                  默认推荐“AI 判断”，只有你很确定要补哪类人时再手动指定。
                </div>
              </div>
              <SelectControl
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={supplementalMode}
                onChange={(event) => setSupplementalMode(event.target.value as SupplementalCharacterGenerationMode)}
              >
                <option value="auto">{t("gen.pages.novels.components.NovelCharacterPanel.aiDetermineNeededPlaceholder")}</option>
                <option value="linked">{t("gen.pages.novels.components.NovelCharacterPanel.gen_2eb92b6f")}</option>
                <option value="independent">{t("gen.pages.novels.components.NovelCharacterPanel.gen_9d6ec340")}</option>
              </SelectControl>

              {characters.length > 0 && supplementalMode !== "independent" ? (
                <div className="space-y-2">
                  <div className="font-medium">{t("gen.pages.novels.components.NovelCharacterPanel.gen_f82db5ca")}</div>
                  <div className="text-xs text-muted-foreground">
                    可不选；不选时 AI 会自己判断应该围绕谁补位。
                  </div>
                  <div className="max-h-40 space-y-2 overflow-auto rounded-xl border bg-muted/15 p-3">
                    {characters.map((character) => (
                      <label key={character.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={supplementalAnchorIds.includes(character.id)}
                          onChange={() => toggleSupplementalAnchor(character.id)}
                        />
                        <span>
                          {character.name}
                          <span className="ml-1 text-xs text-muted-foreground">({character.role})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="font-medium">{t("gen.pages.novels.components.NovelCharacterPanel.gen_92846493")}</div>
                  <SelectControl
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={supplementalTargetRole}
                    onChange={(event) => setSupplementalTargetRole(event.target.value as CharacterCastRole | "auto")}
                  >
                    <option value="auto">{t("gen.pages.novels.components.NovelCharacterPanel.aiJudging")}</option>
                    <option value="protagonist">{t("gen.pages.novels.components.NovelCharacterPanel.mainCharacter")}</option>
                    <option value="antagonist">{t("gen.pages.novels.components.NovelCharacterPanel.mainEnemy")}</option>
                    <option value="ally">{t("gen.pages.novels.components.NovelCharacterPanel.gen_9669fc43")}</option>
                    <option value="foil">{t("gen.pages.novels.components.NovelCharacterPanel.gen_d7fc88ac")}</option>
                    <option value="mentor">{t("gen.pages.novels.components.NovelCharacterPanel.gen_d62518be")}</option>
                    <option value="love_interest">{t("gen.pages.novels.components.NovelCharacterPanel.gen_65c52a7e")}</option>
                    <option value="pressure_source">{t("gen.pages.novels.components.NovelCharacterPanel.gen_7aa91c6c")}</option>
                    <option value="catalyst">{t("gen.pages.novels.components.NovelCharacterPanel.gen_f57197c6")}</option>
                  </SelectControl>
                </div>
                <div className="space-y-2">
                  <div className="font-medium">{t("gen.pages.novels.components.NovelCharacterPanel.gen_e99dfdf4")}</div>
                  <SelectControl
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={supplementalCount}
                    onChange={(event) => setSupplementalCount(event.target.value as "auto" | "1" | "2" | "3")}
                  >
                    <option value="auto">{t("gen.pages.novels.components.NovelCharacterPanel.aiJudging")}</option>
                    <option value="1">{t("gen.pages.novels.components.NovelCharacterPanel.oneItem")}</option>
                    <option value="2">{t("gen.pages.novels.components.NovelCharacterPanel.twoItems")}</option>
                    <option value="3">{t("gen.pages.novels.components.NovelCharacterPanel.threeItems")}</option>
                  </SelectControl>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-medium">{t("gen.pages.novels.components.NovelCharacterPanel.gen_a63d16b7")}</div>
                <textarea
                  className="min-h-[140px] w-full rounded-xl border bg-background p-3 text-sm"
                  placeholder={t("gen.pages.novels.components.NovelCharacterPanel.exampleAddSomeoneCanKeepApplyingPressureToMainCharacterNotPureAntiHeroOrOldRumorWithMotherLine")}
                  value={supplementalPrompt}
                  onChange={(event) => setSupplementalPrompt(event.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={supplementalUseWorldContext}
                  onChange={(event) => setSupplementalUseWorldContext(event.target.checked)}
                />
                基于本书世界生成
              </label>

              <div className="flex flex-wrap gap-2">
                <AiButton
                  onClick={handleGenerateSupplementalCharacters}
                  disabled={isGeneratingSupplementalCharacters || (supplementalMode === "linked" && characters.length === 0)}
                >
                  {isGeneratingSupplementalCharacters ? t("gen.pages.novels.components.NovelCharacterPanel.gen_4d020ba3") : t("gen.pages.novels.components.NovelCharacterPanel.gen_d7cc807f")}
                </AiButton>
                <Badge variant="outline">{t("gen.pages.novels.components.NovelCharacterPanel.gen_64273cfc")}</Badge>
                <Badge variant="outline">{t("gen.pages.novels.components.NovelCharacterPanel.gen_d3053d0b")}</Badge>
              </div>

              {supplementalStatusMessage ? (
                <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-xs text-muted-foreground">
                  {supplementalStatusMessage}
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-2xl border p-4 xl:min-h-0 xl:overflow-y-auto">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">{t("gen.pages.novels.components.NovelCharacterPanel.gen_e995da4f")}</div>
                {supplementalResult ? <Badge variant="outline">{t("gen.pages.novels.components.NovelCharacterPanel.gen_supplement_9nxx")}</Badge> : null}
                {supplementalResult?.mode ? <Badge variant="outline">{t("gen.pages.novels.components.NovelCharacterPanel.gen_f98b4efe")}</Badge> : null}
              </div>
              {supplementalResult?.planningSummary ? (
                <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 text-xs text-muted-foreground">
                  AI 判断：{supplementalResult.planningSummary}
                </div>
              ) : null}

              {isGeneratingSupplementalCharacters ? (
                <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  正在分析当前角色网并生成补位候选...
                </div>
              ) : supplementalResult?.candidates.length ? (
                <div className="space-y-3">
                  {supplementalResult.candidates.map((candidate) => (
                    <div key={candidate.name} className="rounded-2xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium">{candidate.name}</div>
                            <Badge variant="outline">{candidate.role}</Badge>
                            <Badge variant="secondary">{getCastRoleLabel(candidate.castRole)}</Badge>
                            <Badge variant="outline">{t("gen.pages.novels.components.NovelCharacterPanel.gen_7085f7ff")}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">{candidate.summary}</div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => void handleApplySupplementalCharacter(candidate)}
                          disabled={isApplyingSupplementalCharacter}
                        >
                          {isApplyingSupplementalCharacter ? t("gen.pages.novels.components.NovelCharacterPanel.gen_b26107b6") : t("gen.pages.novels.components.NovelCharacterPanel.gen_d0d58dad")}
                        </Button>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                          <div>{t("gen.pages.novels.components.NovelCharacterPanel.gen_fdd2c033")}</div>
                          <div>{t("gen.pages.novels.components.NovelCharacterPanel.relationWithProtagonistSpecified")}</div>
                          <div>{t("gen.pages.novels.components.NovelCharacterPanel.gen_fd1f37a1")}</div>
                          <div>{t("gen.pages.novels.components.NovelCharacterPanel.gen_806ff74a")}</div>
                        </div>
                        <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                          <div>{t("gen.pages.novels.components.NovelCharacterPanel.gen_604697af")}</div>
                          <div>{t("gen.pages.novels.components.NovelCharacterPanel.gen_57e02562")}</div>
                          <div>{t("gen.pages.novels.components.NovelCharacterPanel.gen_6778c422")}</div>
                          <div>{t("gen.pages.novels.components.NovelCharacterPanel.gen_a8658b2e")}</div>
                        </div>
                      </div>

                      {candidate.relations.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">{t("gen.pages.novels.components.NovelCharacterPanel.gen_a0237f0c")}</div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {candidate.relations.map((relation, index) => (
                              <div key={`${candidate.name}-${relation.sourceName}-${relation.targetName}-${index}`} className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                                <div className="font-medium text-foreground">{getSupplementalRelationLabel(candidate, relation)}</div>
                                <div>{t("gen.pages.novels.components.NovelCharacterPanel.gen_510a8aa6")}</div>
                                {relation.hiddenTension ? <div>{t("gen.pages.novels.components.NovelCharacterPanel.gen_517ccc87")}</div> : null}
                                {relation.conflictSource ? <div>{t("gen.pages.novels.components.NovelCharacterPanel.gen_5e01ec63")}</div> : null}
                                {relation.nextTurnPoint ? <div>{t("gen.pages.novels.components.NovelCharacterPanel.nextReversalPoint")}</div> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                          这名角色更偏向独立补位，不强制写入角色关系。
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
                  先说明你想补哪类角色，或直接交给 AI 判断，再生成候选。
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CharacterDiagnosticsSection
        novelId={novelId}
        characters={characters}
        selectedCharacter={selectedCharacter}
        selectedCharacterId={selectedCharacterId}
        onSelectedCharacterChange={onSelectedCharacterChange}
        llmProvider={llmProvider}
        llmModel={llmModel}
      />

      <CharacterAssetWorkspace
        characters={characters}
        selectedCharacterId={selectedCharacterId}
        onSelectedCharacterChange={onSelectedCharacterChange}
        onDeleteCharacter={onDeleteCharacter}
        isDeletingCharacter={isDeletingCharacter}
        deletingCharacterId={deletingCharacterId}
        selectedCharacter={selectedCharacter}
        characterForm={characterForm}
        onCharacterFormChange={onCharacterFormChange}
        onSaveCharacter={onSaveCharacter}
        isSavingCharacter={isSavingCharacter}
        timelineEvents={timelineEvents}
        onSyncTimeline={onSyncTimeline}
        isSyncingTimeline={isSyncingTimeline}
        onSyncAllTimeline={onSyncAllTimeline}
        isSyncingAllTimeline={isSyncingAllTimeline}
        onWorldCheck={onWorldCheck}
        isCheckingWorld={isCheckingWorld}
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
        characterResources={characterResources}
        pendingCharacterResourceCount={pendingCharacterResourceCount}
        onBackfillCharacterResources={onBackfillCharacterResources}
        isBackfillingCharacterResources={isBackfillingCharacterResources}
      />
    </div>
  );
}
