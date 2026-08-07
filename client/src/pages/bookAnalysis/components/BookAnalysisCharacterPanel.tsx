import { useMemo, useState } from "react";
import type {
  BookAnalysisCharacter,
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerationDepth,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import { BOOK_ANALYSIS_CHARACTER_DIMENSION_LABELS } from "@ai-novel/shared/types/bookAnalysisCharacter";
import { CHARACTER_PROFILE_FIELD_LABELS } from "@ai-novel/shared/types/characterProfile";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import { MessageCircle, Pencil, Sparkles, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import CharacterConversationWorkbench from "@/components/characterConversation/CharacterConversationWorkbench";
import BookAnalysisCharacterAppearancePanel from "./BookAnalysisCharacterAppearancePanel";
import BookAnalysisCharacterCandidateCard from "./BookAnalysisCharacterCandidateCard";
import BookAnalysisCharacterImagePanel from "./BookAnalysisCharacterImagePanel";
import SelectControl from "@/components/common/SelectControl";

const DEFAULT_DIMENSIONS: BookAnalysisCharacterDimension[] = [
  "basic",
  "appearance",
  "personality",
  "capability",
  "motivation",
  "arc",
  "relations",
  "scenes",
  "languageStyle",
  "thinkingPattern",
  "values",
  "secrets",
];

const PROFILE_TEXT_FIELDS: Array<keyof CharacterProfile> = [
  "appearance",
  "personality",
  "outerGoal",
  "innerNeed",
  "speakingStyle",
  "growthTrajectory",
];

interface CharacterEditDraft {
  name: string;
  role: string;
  personality: string;
}

interface BookAnalysisCharacterPanelProps {
  analysisId: string;
  characters: BookAnalysisCharacter[];
  disabled: boolean;
  isLoading: boolean;
  pending: {
    generate: boolean;
    identify: boolean;
    generateProfile: boolean;
    generateAll: boolean;
    generatingIds: Set<string>;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  onIdentify: () => Promise<void>;
  onGenerateProfile: (
    characterId: string,
    input: {
      generationDepth: BookAnalysisCharacterGenerationDepth;
      selectedDimensions: BookAnalysisCharacterDimension[];
    },
  ) => Promise<void>;
  onGenerateAll: (input: {
    generationDepth: BookAnalysisCharacterGenerationDepth;
    selectedDimensions: BookAnalysisCharacterDimension[];
  }) => Promise<void>;
  batchSummary: {
    generated: number;
    failed: number;
    pending: number;
    total: number;
  } | null;
  onDismissBatchSummary: () => void;
  onCreate: (input: {
    name: string;
    role: string;
    profile?: Partial<CharacterProfile>;
    generationDepth?: BookAnalysisCharacterGenerationDepth;
    selectedDimensions?: BookAnalysisCharacterDimension[];
  }) => Promise<void>;
  onUpdate: (
    characterId: string,
    input: {
      name?: string;
      role?: string;
      profile?: Partial<CharacterProfile>;
      selectedDimensions?: BookAnalysisCharacterDimension[];
    },
  ) => Promise<void>;
  onDelete: (characterId: string) => Promise<void>;
}

function toggleDimension(
  dimensions: BookAnalysisCharacterDimension[],
  dimension: BookAnalysisCharacterDimension,
): BookAnalysisCharacterDimension[] {
  if (dimensions.includes(dimension)) {
    const next = dimensions.filter((item) => item !== dimension);
    return next.length > 0 ? next : ["basic"];
  }
  return [...dimensions, dimension];
}

function buildEditDraft(character: BookAnalysisCharacter): CharacterEditDraft {
  return {
    name: character.name,
    role: character.role,
    personality: character.profile.personality ?? "",
  };
}

function availableChapterAnchors(character: BookAnalysisCharacter): number[] {
  const chapterIndexes = [
    ...character.evidence.map((item) => item.chapterIndex),
    ...character.profileSections.flatMap((section) => section.evidence.map((item) => item.chapterIndex)),
    ...character.arcs.map((arc) => arc.chapterIndex),
    ...character.scenes.flatMap((scene) => scene.evidence.map((item) => item.chapterIndex)),
  ]
    .filter((chapterIndex): chapterIndex is number => typeof chapterIndex === "number" && chapterIndex > 0)
    .map((chapterIndex) => chapterIndex + 1);
  const appearanceChapterOrders = (character.appearance?.snapshots ?? [])
    .filter((snapshot) => snapshot.chapterIndex >= 0 && snapshot.evidence.length > 0)
    .map((snapshot) => snapshot.chapterIndex + 1);
  return [...new Set([...chapterIndexes, ...appearanceChapterOrders])].sort((left, right) => left - right);
}

export default function BookAnalysisCharacterPanel(props: BookAnalysisCharacterPanelProps) {
  const {
    characters,
    analysisId,
    disabled,
    isLoading,
    pending,
    onIdentify,
    onGenerateProfile,
    onGenerateAll,
    batchSummary,
    onDismissBatchSummary,
    onCreate,
    onUpdate,
    onDelete,
  } = props;
  const [generationDepth, setGenerationDepth] = useState<BookAnalysisCharacterGenerationDepth>("standard");
  const [selectedDimensions, setSelectedDimensions] = useState<BookAnalysisCharacterDimension[]>(DEFAULT_DIMENSIONS);
  const [manualName, setManualName] = useState("");
  const [manualRole, setManualRole] = useState("");
  const [manualPersonality, setManualPersonality] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState<CharacterEditDraft | null>(null);
  const [candidateExpanded, setCandidateExpanded] = useState(false);
  const [conversationTarget, setConversationTarget] = useState<{ characterId: string; chapterAnchor: number } | null>(null);

  const generatedCharacters = useMemo(
    () => characters.filter((character) => character.status === "generated"),
    [characters],
  );
  const candidateCharacters = useMemo(
    () => characters.filter((character) => character.status !== "generated"),
    [characters],
  );
  const pendingCandidateCount = candidateCharacters.filter((character) => character.status !== "generating").length;
  const failedCandidateCount = candidateCharacters.filter((character) => character.status === "failed").length;
  const freshCandidateCount = candidateCharacters.filter((character) => character.status === "candidate").length;
  const batchButtonTitle = (() => {
    if (failedCandidateCount > 0 && freshCandidateCount > 0) {
      return `为 ${freshCandidateCount} 个新候选生成档案，并重试 ${failedCandidateCount} 个失败角色`;
    }
    if (failedCandidateCount > 0) {
      return `重试 ${failedCandidateCount} 个失败的角色`;
    }
    return `为 ${freshCandidateCount} 个候选生成深度档案`;
  })();
  const operationPending = pending.generate || pending.identify || pending.generateProfile || pending.generateAll;
  const identifyDisabled = disabled || pending.identify;
  const generateAllDisabled = disabled || pending.generateAll || selectedDimensions.length === 0 || pendingCandidateCount === 0;
  const createDisabled = disabled || pending.create || !manualName.trim() || !manualRole.trim();
  const conversationCharacter = conversationTarget ? generatedCharacters.find((character) => character.id === conversationTarget.characterId) ?? null : null;
  const conversationAnchors = conversationCharacter ? availableChapterAnchors(conversationCharacter) : [];

  const handleCreate = async () => {
    if (createDisabled) {
      return;
    }
    await onCreate({
      name: manualName.trim(),
      role: manualRole.trim(),
      profile: manualPersonality.trim() ? { personality: manualPersonality.trim() } : undefined,
      generationDepth: "brief",
      selectedDimensions: ["basic", "personality"],
    });
    setManualName("");
    setManualRole("");
    setManualPersonality("");
  };

  const startEdit = (character: BookAnalysisCharacter) => {
    setEditingId(character.id);
    setEditDraft(buildEditDraft(character));
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditDraft(null);
  };

  const saveEdit = async (characterId: string) => {
    if (!editDraft?.name.trim() || !editDraft.role.trim()) {
      return;
    }
    await onUpdate(characterId, {
      name: editDraft.name.trim(),
      role: editDraft.role.trim(),
      profile: editDraft.personality.trim() ? { personality: editDraft.personality.trim() } : { personality: "" },
    });
    cancelEdit();
  };

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pb-5 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl">角色档案</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">阅读人物动机、成长变化与关键场景，按需继续深挖。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="border-0 bg-muted/70 font-normal">{generatedCharacters.length} 份档案</Badge>
            {candidateCharacters.length > 0 ? <Badge variant="secondary" className="border-0 bg-muted/70 font-normal">{candidateCharacters.length} 个候选</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 px-0">
        {conversationTarget && conversationCharacter ? (
          <CharacterConversationWorkbench
            subject={{ kind: "book_analysis_character", id: conversationCharacter.id, scopeKind: "book_analysis", scopeId: analysisId }}
            characterName={conversationCharacter.name}
            chapterAnchor={conversationTarget.chapterAnchor}
            chapterAnchorOptions={conversationAnchors}
            onChapterAnchorChange={(chapterAnchor) => setConversationTarget({ characterId: conversationCharacter.id, chapterAnchor })}
            defaultFullscreen
            closeOnExitFullscreen
            onClose={() => setConversationTarget(null)}
          />
        ) : null}
        <details className="group overflow-hidden rounded-2xl border border-border/40 bg-card/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                生成与添加角色
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">识别原文人物、选择档案深度，或手动补充角色。</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground group-open:hidden">展开</span>
            <span className="hidden shrink-0 text-xs text-muted-foreground group-open:inline">收起</span>
          </summary>
          <div className="grid gap-4 border-t border-border/35 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4 rounded-xl bg-muted/25 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void onIdentify()} disabled={identifyDisabled}>
                {pending.identify ? "识别中..." : characters.length > 0 ? "再识别角色" : "识别角色"}
              </Button>
              {candidateCharacters.length > 0 ? (
                <Button
                  size="sm"
                  onClick={() => void onGenerateAll({ generationDepth, selectedDimensions })}
                  disabled={generateAllDisabled}
                  title={batchButtonTitle}
                >
                  {pending.generateAll ? "生成中..." : `全部生成 (${pendingCandidateCount})`}
                </Button>
              ) : null}
              <SelectControl
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={generationDepth}
                onChange={(event) => setGenerationDepth(event.target.value as BookAnalysisCharacterGenerationDepth)}
                disabled={disabled || operationPending}
              >
                <option value="brief">简要</option>
                <option value="standard">标准</option>
                <option value="deep">深入</option>
                <option value="exhaustive">完整</option>
              </SelectControl>
            </div>
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">档案包含内容</div>
              <div className="flex flex-wrap gap-1.5">
              {DEFAULT_DIMENSIONS.map((dimension) => (
                <Button
                  key={dimension}
                  size="sm"
                  variant="ghost"
                  className={selectedDimensions.includes(dimension)
                    ? "h-8 rounded-full bg-primary/10 px-3 text-primary hover:bg-primary/15 hover:text-primary"
                    : "h-8 rounded-full px-3 text-muted-foreground hover:bg-muted"}
                  onClick={() => setSelectedDimensions((current) => toggleDimension(current, dimension))}
                  disabled={disabled || operationPending}
                  aria-pressed={selectedDimensions.includes(dimension)}
                >
                  {BOOK_ANALYSIS_CHARACTER_DIMENSION_LABELS[dimension]}
                </Button>
              ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl bg-muted/25 p-4">
            <div className="pb-1 text-xs font-medium text-muted-foreground">手动补充角色</div>
            <Input
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              placeholder="角色名"
              disabled={disabled || pending.create}
            />
            <Input
              value={manualRole}
              onChange={(event) => setManualRole(event.target.value)}
              placeholder="角色定位"
              disabled={disabled || pending.create}
            />
            <textarea
              className="min-h-[72px] w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={manualPersonality}
              onChange={(event) => setManualPersonality(event.target.value)}
              placeholder="性格或关键表现"
              disabled={disabled || pending.create}
            />
            <Button size="sm" variant="outline" onClick={() => void handleCreate()} disabled={createDisabled}>
              手动添加
            </Button>
          </div>
          </div>
        </details>

        {batchSummary ? (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm ${
              batchSummary.failed + batchSummary.pending > 0
                ? "border-warning/30 bg-warning/5 text-warning"
                : "border-success/30 bg-success/5 text-success"
            }`}
          >
            <div className="space-y-1">
              <div className="font-medium">
                {batchSummary.failed + batchSummary.pending === 0
                  ? `本次批量已生成 ${batchSummary.generated} / ${batchSummary.total} 个角色档案`
                  : `本次批量已生成 ${batchSummary.generated} 个，未完成 ${batchSummary.failed + batchSummary.pending} 个`}
              </div>
              {batchSummary.failed + batchSummary.pending > 0 ? (
                <div className="text-xs">
                  {batchSummary.failed > 0 ? `失败 ${batchSummary.failed} 个` : ""}
                  {batchSummary.failed > 0 && batchSummary.pending > 0 ? "，" : ""}
                  {batchSummary.pending > 0 ? `因预算用尽未跑 ${batchSummary.pending} 个` : ""}
                  。可调整预算或扩容后再点「全部生成」继续。
                </div>
              ) : null}
            </div>
            <Button size="sm" variant="ghost" onClick={onDismissBatchSummary}>
              知道了
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">正在读取角色档案。</div>
        ) : null}

        {!isLoading && candidateCharacters.length > 0 ? (
          <section className="overflow-hidden rounded-2xl border border-border/40 bg-card/60">
            <button
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30"
              onClick={() => setCandidateExpanded((current) => !current)}
            >
              <div>
                <div className="text-sm font-medium">待生成角色</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {candidateCharacters.length} 个候选，可按需生成深度档案。
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{candidateExpanded ? "收起" : "展开"}</span>
            </button>
            {candidateExpanded ? (
              <div className="grid gap-3 border-t border-border/35 p-4 xl:grid-cols-2">
                {candidateCharacters.map((character) => (
                  <BookAnalysisCharacterCandidateCard
                    key={character.id}
                    character={character}
                    disabled={disabled}
                    isGenerating={pending.generatingIds.has(character.id)}
                    generationDepth={generationDepth}
                    selectedDimensions={selectedDimensions}
                    onGenerate={onGenerateProfile}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-2">
          {generatedCharacters.map((character) => {
            const isEditing = editingId === character.id && editDraft;
            return (
              <article
                key={character.id}
                className="rounded-2xl border border-border/40 bg-card/80 p-5 text-sm shadow-[0_12px_36px_rgba(15,23,42,0.035)]"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={editDraft.name}
                      onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                      disabled={pending.update}
                    />
                    <Input
                      value={editDraft.role}
                      onChange={(event) => setEditDraft({ ...editDraft, role: event.target.value })}
                      disabled={pending.update}
                    />
                    <textarea
                      className="min-h-[84px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={editDraft.personality}
                      onChange={(event) => setEditDraft({ ...editDraft, personality: event.target.value })}
                      disabled={pending.update}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void saveEdit(character.id)} disabled={pending.update}>
                        保存
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit} disabled={pending.update}>
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/35 pb-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/[0.08] text-primary">
                          <UserRound className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-lg font-semibold tracking-tight">{character.name}</div>
                          <div className="mt-0.5 line-clamp-2 text-muted-foreground">{character.role}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="rounded-full"
                          onClick={() => {
                            const anchors = availableChapterAnchors(character);
                            if (anchors.length === 0) {
                              return;
                            }
                            setConversationTarget({ characterId: character.id, chapterAnchor: anchors[anchors.length - 1] });
                          }}
                          disabled={disabled || availableChapterAnchors(character).length === 0}
                          title={availableChapterAnchors(character).length === 0 ? "该角色缺少带章节号的原文证据，暂时无法开始证据访谈。" : undefined}
                        >
                          <MessageCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          基于原文访谈
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-full px-2.5" onClick={() => startEdit(character)} disabled={disabled}>
                          <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full px-2.5 text-muted-foreground hover:text-destructive"
                          onClick={() => void onDelete(character.id)}
                          disabled={disabled || pending.delete}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          删除
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-x-8 md:grid-cols-2">
                      {PROFILE_TEXT_FIELDS.map((field) => {
                        const value = character.profile[field];
                        return typeof value === "string" && value.trim() ? (
                          <div key={field} className="border-b border-border/30 py-4 last:border-b-0">
                            <div className="text-[11px] font-medium tracking-wide text-muted-foreground">{CHARACTER_PROFILE_FIELD_LABELS[field]}</div>
                            <div className="mt-1.5 whitespace-pre-wrap leading-6 text-foreground/90">{value}</div>
                          </div>
                        ) : null;
                      })}
                    </div>
                    {character.arcs.length > 0 || character.scenes.length > 0 ? (
                      <div className="mt-5 grid gap-6 border-t border-border/35 pt-4 md:grid-cols-2">
                        {character.arcs.length > 0 ? (
                          <section>
                            <div className="mb-3 font-medium">成长轨迹</div>
                            <div className="space-y-3 border-l border-primary/20 pl-4">
                              {character.arcs.map((arc) => (
                                <div key={arc.id} className="relative">
                                  <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-primary/55" aria-hidden="true" />
                                  <div className="leading-5">{arc.stageLabel}</div>
                                  {arc.chapterIndex !== null && arc.chapterIndex !== undefined ? (
                                    <div className="mt-0.5 text-xs text-muted-foreground">第 {arc.chapterIndex + 1} 章</div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </section>
                        ) : null}
                        {character.scenes.length > 0 ? (
                          <section>
                            <div className="mb-3 font-medium">关键场景</div>
                            <div className="flex flex-wrap gap-2">
                              {character.scenes.map((scene) => (
                                <div key={scene.id} className="rounded-xl bg-muted/45 px-3 py-2">
                                  <div className="leading-5">{scene.sceneLabel}</div>
                                  {scene.sceneType ? (
                                    <div className="mt-0.5 text-[11px] text-muted-foreground">{scene.sceneType}</div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </section>
                        ) : null}
                      </div>
                    ) : null}
                    <details className="group mt-5 border-t border-border/35 pt-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between marker:hidden">
                        <span className="font-medium">形象与视觉资料</span>
                        <span className="text-xs text-muted-foreground group-open:hidden">展开</span>
                        <span className="hidden text-xs text-muted-foreground group-open:inline">收起</span>
                      </summary>
                      <BookAnalysisCharacterAppearancePanel
                        analysisId={analysisId}
                        character={character}
                        disabled={disabled}
                      />
                      <BookAnalysisCharacterImagePanel
                        analysisId={analysisId}
                        character={character}
                        disabled={disabled}
                      />
                    </details>
                  </>
                )}
              </article>
            );
          })}
        </div>

        {!isLoading && characters.length === 0 ? (
          <div className="text-sm text-muted-foreground">可先识别角色候选，再选择需要深挖的角色生成档案。</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
