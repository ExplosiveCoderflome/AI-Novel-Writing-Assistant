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
  { key: "appearance", label: "样貌记忆点", placeholder: "眉眼、发型、表情习惯等能被读者记住的样貌特征" },
  { key: "physique", label: "体态基底", placeholder: "年龄感、身形、行动姿态、身体状态基底" },
  { key: "attireStyle", label: "常见穿着", placeholder: "日常穿着、身份外观、阶层或职业痕迹" },
  { key: "signatureDetail", label: "标志细节", placeholder: "标志物、动作、微习惯、气味或反复可用的细节" },
  { key: "voiceTexture", label: "声音口吻", placeholder: "声线、说话节奏、句式习惯、口吻" },
  { key: "presenceImpression", label: "登场印象", placeholder: "首次或常规登场时给读者的直观感受" },
];

function getSecretStatus(selectedCharacter?: Character): string {
  if (!selectedCharacter) {
    return "暂无";
  }
  if (selectedCharacter.secret?.trim()) {
    return "存在明确秘密";
  }
  const runtimeSignal = `${selectedCharacter.currentState ?? ""} ${selectedCharacter.currentGoal ?? ""}`;
  return /秘密|隐瞒|卧底|伪装/.test(runtimeSignal) ? "已隐藏关键信息" : "暂无显性秘密";
}

function getEmotionSignal(selectedCharacter?: Character): string {
  const runtimeSignal = `${selectedCharacter?.currentState ?? ""} ${selectedCharacter?.currentGoal ?? ""}`;
  if (/愤|怒|焦虑|崩溃|绝望/.test(runtimeSignal)) {
    return "高压";
  }
  if (/平静|稳|冷静|从容/.test(runtimeSignal)) {
    return "平稳";
  }
  return "待观察";
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
      label: "主角完整资源",
      helper: "主角会完整展示道具、线索、身份凭证、底牌和消耗状态，后续章节会优先参考这些行动边界。",
      limit: 10,
      shouldShowResource: () => true,
    };
  }
  if (/临时|路人|客串|一次性/.test(roleText)) {
    return {
      label: "临时角色资源",
      helper: "临时角色只展示会跨章复用、牵动冲突、绑定伏笔或被主角带走的资源。",
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
    label: "长期角色关键资源",
    helper: "长期角色优先展示会改变行动选择、关系筹码、读者知情或伏笔兑现的资源。",
    limit: 6,
    shouldShowResource: (item) => item.status !== "stale",
  };
}

function getResourceStatusLabel(status: CharacterResourceLedgerItem["status"]): string {
  const labels: Record<CharacterResourceLedgerItem["status"], string> = {
    available: "可用",
    hidden: "隐藏",
    borrowed: "借用",
    transferred: "转交",
    lost: "丢失",
    consumed: "已消耗",
    damaged: "受损",
    destroyed: "毁坏",
    stale: "淡出",
  };
  return labels[status] ?? status;
}

function getResourceFunctionLabel(value: CharacterResourceLedgerItem["narrativeFunction"]): string {
  const labels: Record<CharacterResourceLedgerItem["narrativeFunction"], string> = {
    tool: "工具",
    clue: "线索",
    weapon: "武器",
    proof: "证据",
    key: "钥匙",
    cost: "代价",
    promise: "伏笔",
    hidden_card: "底牌",
    constraint: "限制",
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
            <CardTitle>角色资产工作台</CardTitle>
            <div className="text-sm text-muted-foreground">
              左侧负责切换角色，右侧集中处理当前角色的状态、动机、成长弧和时间线。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{characters.length} 个已建角色</Badge>
            {selectedCharacter ? <Badge variant="secondary">当前编辑：{selectedCharacter.name}</Badge> : null}
            {isSelectedProtagonist ? <Badge variant="outline">主角</Badge> : null}
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
                <div className="text-xs text-muted-foreground">运行状态</div>
                <div className="mt-2 text-xs text-muted-foreground">当前状态：{selectedCharacter.currentState || "待补全"}</div>
                <div className="text-xs text-muted-foreground">当前目标：{selectedCharacter.currentGoal || "待补全"}</div>
                <div className="text-xs text-muted-foreground">情绪基调：{emotionSignal}</div>
                <div className="text-xs text-muted-foreground">秘密状态：{secretStatus}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">戏剧蓝图</div>
                <div className="mt-2 text-xs text-muted-foreground">故事作用：{selectedCharacter.storyFunction || "待补全"}</div>
                <div className="text-xs text-muted-foreground">
                  与主角关系：{selectedCharacter.relationToProtagonist || "待补全"}
                </div>
                <div className="text-xs text-muted-foreground">外在目标：{selectedCharacter.outerGoal || "待补全"}</div>
                <div className="text-xs text-muted-foreground">内在需求：{selectedCharacter.innerNeed || "待补全"}</div>
                <div className="text-xs text-muted-foreground">
                  恐惧 / 伤口：{selectedCharacter.fear || selectedCharacter.wound || "待补全"}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">性格与成长弧</div>
                <div className="mt-2 text-xs text-muted-foreground">核心性格：{selectedCharacter.personality || "待补全"}</div>
                <div className="text-xs text-muted-foreground">背景：{selectedCharacter.background || "待补全"}</div>
                <div className="text-xs text-muted-foreground">成长弧：{selectedCharacter.development || "待补全"}</div>
                <div className="text-xs text-muted-foreground">错误信念：{selectedCharacter.misbelief || "待补全"}</div>
                <div className="text-xs text-muted-foreground">道德底线：{selectedCharacter.moralLine || "待补全"}</div>
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-medium">外显资料</div>
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
                    {isGeneratingVisibleProfile ? "生成中..." : "AI 补全外显资料"}
                  </AiButton>
                  <AiButton
                    size="sm"
                    variant="outline"
                    onClick={() => onGenerateBatchVisibleProfiles(visibleProfileGuidance)}
                    disabled={isGeneratingBatchVisibleProfiles || characters.length === 0}
                  >
                    {isGeneratingBatchVisibleProfiles ? "生成中..." : "批量补全角色外显资料"}
                  </AiButton>
                </div>
              </div>
              <div className="mt-3">
                <textarea
                  className="min-h-[72px] w-full rounded-md border bg-background p-2 text-sm"
                  placeholder="补全倾向（可选）：例如更有压迫感、带一点病弱感、声音更温和、不要写成传统美人"
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
                      {isApplyingVisibleProfile ? "保存中..." : "保存到角色卡"}
                    </Button>
                  </div>
                  {visibleProfileSuggestion.warnings.length > 0 ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900">
                      {visibleProfileSuggestion.warnings.map((warning) => (
                        <div key={warning}>提醒：{warning}</div>
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
                          <div className="text-muted-foreground">当前：{selectedCharacter[field.key] || "待补全"}</div>
                          <div>建议：{nextValue || skippedReason || "暂不写入"}</div>
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
                      {isApplyingBatchVisibleProfiles ? "写入中..." : "写入批量结果"}
                    </Button>
                  </div>
                  <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
                    {batchVisibleProfileResult.results.map((result) => (
                      <div key={result.characterId} className="rounded-md border bg-muted/10 p-2 text-xs leading-5">
                        <div className="font-medium">{result.characterName}</div>
                        <div className="text-muted-foreground">
                          {result.hasApplicableChanges
                            ? `可写入 ${Object.keys(result.fields).length} 项`
                            : "没有可写入项"}
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
                    <div className="mt-1 text-sm leading-6">{selectedCharacter[field.key] || "待补全"}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">关键资源</div>
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
                    {isBackfillingCharacterResources ? "回填中..." : "回填最近章节"}
                  </Button>
                  <Badge variant="outline">{resourceDisplayMode.label}</Badge>
                  {pendingCharacterResourceCount > 0 ? (
                    <Badge variant="secondary">{pendingCharacterResourceCount} 条资源变更待确认</Badge>
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
                        <div>持有者：{resource.holderCharacterName || selectedCharacter.name}</div>
                        <div>读者知情：{resource.readerKnows ? "知情" : "未公开"}</div>
                        {resource.expectedUseEndChapterOrder ? (
                          <div>使用窗口：第{resource.expectedUseStartChapterOrder ?? "?"}章至第{resource.expectedUseEndChapterOrder}章</div>
                        ) : null}
                        {resource.constraints.length > 0 ? (
                          <div>限制：{resource.constraints.slice(0, 2).join(" / ")}</div>
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
              <summary className="cursor-pointer font-medium">完整设定与编辑</summary>
              <div className="mt-3 space-y-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    placeholder="角色名称"
                    value={characterForm.name}
                    onChange={(event) => onCharacterFormChange("name", event.target.value)}
                  />
                  <Input
                    placeholder="角色定位"
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
                    <option value="unknown">性别：未知</option>
                    <option value="male">性别：男</option>
                    <option value="female">性别：女</option>
                    <option value="other">性别：其他</option>
                  </SelectControl>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    placeholder="当前状态（例如：重伤闭关）"
                    value={characterForm.currentState}
                    onChange={(event) => onCharacterFormChange("currentState", event.target.value)}
                  />
                  <Input
                    placeholder="当前目标（例如：三个月内突破）"
                    value={characterForm.currentGoal}
                    onChange={(event) => onCharacterFormChange("currentGoal", event.target.value)}
                  />
                </div>
                <textarea
                  className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                  placeholder="性格补充"
                  value={characterForm.personality}
                  onChange={(event) => onCharacterFormChange("personality", event.target.value)}
                />
                <textarea
                  className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                  placeholder="背景补充"
                  value={characterForm.background}
                  onChange={(event) => onCharacterFormChange("background", event.target.value)}
                />
                <textarea
                  className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                  placeholder="成长弧补充"
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
                    {isSavingCharacter ? "保存中..." : "保存角色资产"}
                  </Button>
                  <AiButton size="sm" variant="outline" onClick={onSyncTimeline} disabled={isSyncingTimeline}>
                    {isSyncingTimeline ? "同步中..." : "同步角色时间线"}
                  </AiButton>
                  <AiButton
                    size="sm"
                    variant="outline"
                    onClick={onSyncAllTimeline}
                    disabled={isSyncingAllTimeline}
                  >
                    {isSyncingAllTimeline ? "同步中..." : "同步全部角色时间线"}
                  </AiButton>
                  <AiButton size="sm" variant="outline" onClick={onWorldCheck} disabled={isCheckingWorld}>
                    {isCheckingWorld ? "检查中..." : "检查世界一致性"}
                  </AiButton>
                </div>
              </div>
            </details>

            <details className="rounded-xl border p-3">
              <summary className="cursor-pointer font-medium">成长弧节点</summary>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div>起点：{selectedCharacter.arcStart || "待补全"}</div>
                <div>中段转折：{selectedCharacter.arcMidpoint || "待补全"}</div>
                <div>高潮选择：{selectedCharacter.arcClimax || "待补全"}</div>
                <div>终点状态：{selectedCharacter.arcEnd || "待补全"}</div>
                <div>首次印象：{selectedCharacter.firstImpression || "待补全"}</div>
                <div>隐藏秘密：{selectedCharacter.secret || "待补全"}</div>
              </div>
            </details>

            <div className="space-y-2">
              <div className="text-sm font-medium">角色事件流（最近 12 条）</div>
              {timelineEvents.length > 0 ? (
                timelineEvents.slice(-12).reverse().map((event) => (
                  <div key={event.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{event.title}</div>
                      <Badge variant="outline">{event.source}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {event.chapterOrder ? `章节 ${event.chapterOrder}` : "无章节归属"} ·{" "}
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
