import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type {
  BaseCharacter,
  Character,
  CharacterCastRole,
  CharacterGender,
  CharacterTimeline,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerateInput,
  SupplementalCharacterGenerationMode,
  SupplementalCharacterGenerationResult,
} from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import CharacterAssetWorkspace from "./CharacterAssetWorkspace";
import CharacterCastOptionsSection from "./CharacterCastOptionsSection";
import CharacterDynamicsSection from "./CharacterDynamicsSection";
import type { QuickCharacterCreatePayload } from "./characterPanel.utils";

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
  currentState: string;
  currentGoal: string;
}

const CAST_ROLE_LABELS: Record<CharacterCastRole, string> = {
  protagonist: "主角",
  antagonist: "主对手",
  ally: "同盟",
  foil: "镜像角色",
  mentor: "导师",
  love_interest: "情感牵引",
  pressure_source: "压力源",
  catalyst: "催化者",
};
const CHARACTER_GENDER_LABELS: Record<CharacterGender, string> = {
  male: "男",
  female: "女",
  other: "其他",
  unknown: "未知",
};
const SUPPLEMENTAL_MODE_LABELS: Record<SupplementalCharacterGenerationMode, string> = {
  auto: "AI 判断",
  linked: "关系补位",
  independent: "独立补位",
};

function getCastRoleLabel(castRole?: CharacterCastRole | "auto" | null): string {
  if (!castRole || castRole === "auto") {
    return "AI 判断";
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return "未知";
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
  onWorldCheck: () => void;
  isCheckingWorld: boolean;
  selectedCharacter?: Character;
  characterForm: CharacterFormState;
  onCharacterFormChange: (field: keyof CharacterFormState, value: string) => void;
  onSaveCharacter: () => void;
  isSavingCharacter: boolean;
  timelineEvents: CharacterTimeline[];
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
    onWorldCheck,
    isCheckingWorld,
    selectedCharacter,
    characterForm,
    onCharacterFormChange,
    onSaveCharacter,
    isSavingCharacter,
    timelineEvents,
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
      setSupplementalStatusMessage("当前还没有已建角色，不能基于关系补充角色。可以先建一个核心角色，或改用“生成相对独立角色”。");
      return;
    }

    try {
      const response = await onGenerateSupplementalCharacters({
        mode: supplementalMode,
        anchorCharacterIds: supplementalMode === "independent" ? [] : supplementalAnchorIds,
        targetCastRole: supplementalTargetRole,
        count: supplementalCount === "auto" ? undefined : Number(supplementalCount),
        userPrompt: supplementalPrompt.trim() || undefined,
      });
      setSupplementalResult(response.data ?? null);
      setSupplementalStatusMessage(response.message ?? "补充角色候选已生成。");
    } catch (error) {
      setSupplementalStatusMessage(error instanceof Error ? error.message : "补充角色生成失败。");
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
      setSupplementalStatusMessage(error instanceof Error ? error.message : "应用补充角色失败。");
    }
  };

  return (
    <div className="space-y-5">
      {characterMessage ? <div className="text-sm text-muted-foreground">{characterMessage}</div> : null}

      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-muted/30">
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Character Prep
              </div>
              <div className="text-2xl font-semibold tracking-tight text-foreground">
                日常主区只保留角色资产
              </div>
              <div className="max-w-2xl text-sm leading-6 text-muted-foreground">
                新增角色和阵容重建都属于阶段性动作，不应该长期挤占角色页主区。这里把它们降成按需入口，把主要空间还给角色资产编辑。
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">已建角色</div>
                <div className="mt-2 text-2xl font-semibold">{characters.length}</div>
                <div className="mt-1 text-xs text-muted-foreground">先把推动主线的人物占位补齐。</div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">核心角色</div>
                <div className="mt-2 text-2xl font-semibold">{coreCharacterCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">至少明确主角与主要对手。</div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">当前焦点</div>
                <div className="mt-2 text-base font-semibold">{selectedCharacter?.name ?? "尚未选择角色"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedCharacter?.role || `${baseCharacters.length} 个基础角色可导入`}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-background/70 p-3">
            <Button onClick={() => setIsCharacterEntryOpen(true)}>新增角色</Button>
            <Button variant="outline" onClick={handleOpenSupplementalDialog}>
              补充角色
            </Button>
            <Button
              variant="secondary"
              onClick={onEvolveCharacter}
              disabled={isEvolvingCharacter || !selectedCharacterId}
            >
              {isEvolvingCharacter ? "补全中..." : "AI 补全当前角色"}
            </Button>
            <Badge variant="outline">低频入口：新增角色 / 导入角色 / 补充角色</Badge>
            <div className="text-xs text-muted-foreground">
              日常编辑建议直接在下方“角色资产工作台”里处理。
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isCharacterEntryOpen} onOpenChange={setIsCharacterEntryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增角色</DialogTitle>
            <DialogDescription>
              只有在新建角色或从基础角色库导入时才需要打开这里。日常维护请直接使用角色资产工作台。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="space-y-3 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="font-medium">快速创建</div>
                <div className="text-xs text-muted-foreground">
                  适合临时补一个新人物占位，再交给下方工作台慢慢打磨。
                </div>
              </div>
              <Input
                placeholder="角色名称（必填）"
                value={quickCharacterForm.name}
                onChange={(event) => onQuickCharacterFormChange("name", event.target.value)}
              />
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={quickCharacterForm.role}
                onChange={(event) => onQuickCharacterFormChange("role", event.target.value)}
              >
                <option value="主角">主角</option>
                <option value="配角">配角</option>
                <option value="反派">反派</option>
                <option value="导师">导师</option>
                <option value="情感线">情感线</option>
                <option value="功能角色">功能角色</option>
              </select>
              <Input
                placeholder="与主角关系（如：试探合作）"
                value={relationToProtagonist}
                onChange={(event) => setRelationToProtagonist(event.target.value)}
              />
              <Input
                placeholder="在故事中的作用（如：推动真相线）"
                value={storyFunction}
                onChange={(event) => setStoryFunction(event.target.value)}
              />
              <Input
                placeholder="角色关键词（逗号分隔）"
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
              <Button onClick={handleQuickCreate} disabled={isQuickCreating || !quickCharacterForm.name.trim()}>
                {isQuickCreating ? "生成中..." : "AI 生成角色卡"}
              </Button>
            </div>

            <div className="space-y-3 rounded-2xl border p-4">
              <div className="space-y-1">
                <div className="font-medium">从基础角色库导入</div>
                <div className="text-xs text-muted-foreground">
                  适合快速引入成熟模板，再按当前小说需求继续微调。
                </div>
              </div>
              {baseCharacters.length > 0 ? (
                <>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={selectedBaseCharacterId}
                    onChange={(event) => onSelectedBaseCharacterChange(event.target.value)}
                  >
                    {baseCharacters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}（{character.role}）
                      </option>
                    ))}
                  </select>
                  {selectedBaseCharacter ? (
                    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{selectedBaseCharacter.name}</span>
                        <Badge variant={importedBaseCharacterIds.has(selectedBaseCharacter.id) ? "outline" : "secondary"}>
                          {importedBaseCharacterIds.has(selectedBaseCharacter.id) ? "已关联" : "未关联"}
                        </Badge>
                      </div>
                      <div className="line-clamp-3 text-xs text-muted-foreground">
                        性格：{selectedBaseCharacter.personality || "暂无"}
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
                      {isImportingBaseCharacter ? "导入中..." : "导入为小说角色"}
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/base-characters">管理基础角色库</Link>
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
            <DialogTitle>补充角色</DialogTitle>
            <DialogDescription>
              适合在已有角色系统基础上补一个缺位人物。你可以指定“从现有关系衍生”或“生成相对独立角色”，也可以直接交给 AI 判断。
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 pb-6 pt-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)] xl:overflow-hidden">
            <div className="space-y-4 rounded-2xl border p-4 xl:min-h-0 xl:overflow-y-auto">
              <div className="space-y-1">
                <div className="font-medium">补位方式</div>
                <div className="text-xs text-muted-foreground">
                  默认推荐“AI 判断”，只有你很确定要补哪类人时再手动指定。
                </div>
              </div>
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={supplementalMode}
                onChange={(event) => setSupplementalMode(event.target.value as SupplementalCharacterGenerationMode)}
              >
                <option value="auto">AI 判断当前更需要哪种补位</option>
                <option value="linked">基于现有角色衍生关系角色</option>
                <option value="independent">生成相对独立角色</option>
              </select>

              {characters.length > 0 && supplementalMode !== "independent" ? (
                <div className="space-y-2">
                  <div className="font-medium">参考已有角色</div>
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
                  <div className="font-medium">期望角色功能</div>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={supplementalTargetRole}
                    onChange={(event) => setSupplementalTargetRole(event.target.value as CharacterCastRole | "auto")}
                  >
                    <option value="auto">AI 判断</option>
                    <option value="protagonist">主角</option>
                    <option value="antagonist">主对手</option>
                    <option value="ally">同盟</option>
                    <option value="foil">镜像角色</option>
                    <option value="mentor">导师</option>
                    <option value="love_interest">情感牵引</option>
                    <option value="pressure_source">压力源</option>
                    <option value="catalyst">催化者</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="font-medium">生成数量</div>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={supplementalCount}
                    onChange={(event) => setSupplementalCount(event.target.value as "auto" | "1" | "2" | "3")}
                  >
                    <option value="auto">AI 判断</option>
                    <option value="1">1 个</option>
                    <option value="2">2 个</option>
                    <option value="3">3 个</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-medium">额外说明</div>
                <textarea
                  className="min-h-[140px] w-full rounded-xl border bg-background p-3 text-sm"
                  placeholder="例如：我想补一个能持续给主角施压、但又不是纯反派的人；或补一个和母亲线相关的旧识。"
                  value={supplementalPrompt}
                  onChange={(event) => setSupplementalPrompt(event.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleGenerateSupplementalCharacters}
                  disabled={isGeneratingSupplementalCharacters || (supplementalMode === "linked" && characters.length === 0)}
                >
                  {isGeneratingSupplementalCharacters ? "生成中..." : "生成补充角色候选"}
                </Button>
                <Badge variant="outline">数量不选时由 AI 自行判断</Badge>
                <Badge variant="outline">关系角色会优先围绕现有角色补位</Badge>
              </div>

              {supplementalStatusMessage ? (
                <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-xs text-muted-foreground">
                  {supplementalStatusMessage}
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-2xl border p-4 xl:min-h-0 xl:overflow-y-auto">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">候选结果</div>
                {supplementalResult ? <Badge variant="outline">{supplementalResult.candidates.length} 个候选</Badge> : null}
                {supplementalResult?.mode ? <Badge variant="outline">本轮模式：{SUPPLEMENTAL_MODE_LABELS[supplementalResult.mode]}</Badge> : null}
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
                            <Badge variant="outline">性别：{getCharacterGenderLabel(candidate.gender)}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">{candidate.summary}</div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => void handleApplySupplementalCharacter(candidate)}
                          disabled={isApplyingSupplementalCharacter}
                        >
                          {isApplyingSupplementalCharacter ? "创建中..." : "创建这个角色"}
                        </Button>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                          <div>故事作用：{candidate.storyFunction}</div>
                          <div>与主角关系：{candidate.relationToProtagonist || "AI 未指定"}</div>
                          <div>外在目标：{candidate.outerGoal || "待补全"}</div>
                          <div>当前目标：{candidate.currentGoal || "待补全"}</div>
                        </div>
                        <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                          <div>第一印象：{candidate.firstImpression || "待补全"}</div>
                          <div>核心恐惧：{candidate.fear || "待补全"}</div>
                          <div>错误信念：{candidate.misbelief || "待补全"}</div>
                          <div>为什么现在补：{candidate.whyNow || "AI 未额外说明"}</div>
                        </div>
                      </div>

                      {candidate.relations.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">建议同步的关系</div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {candidate.relations.map((relation, index) => (
                              <div key={`${candidate.name}-${relation.sourceName}-${relation.targetName}-${index}`} className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                                <div className="font-medium text-foreground">{getSupplementalRelationLabel(candidate, relation)}</div>
                                <div>表层关系：{relation.surfaceRelation}</div>
                                {relation.hiddenTension ? <div>隐藏张力：{relation.hiddenTension}</div> : null}
                                {relation.conflictSource ? <div>冲突来源：{relation.conflictSource}</div> : null}
                                {relation.nextTurnPoint ? <div>下一反转点：{relation.nextTurnPoint}</div> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                          这名角色更偏向独立补位，当前没有强制绑定的结构化关系。
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

      <CharacterCastOptionsSection
        novelId={novelId}
        characters={characters}
        selectedCharacter={selectedCharacter}
        onSelectedCharacterChange={onSelectedCharacterChange}
        llmProvider={llmProvider}
        llmModel={llmModel}
      />

      <CharacterDynamicsSection
        novelId={novelId}
        selectedCharacter={selectedCharacter}
        selectedCharacterId={selectedCharacterId}
        onSelectedCharacterChange={onSelectedCharacterChange}
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
      />
    </div>
  );
}
