import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo, useState } from "react";
import type {
  BookAnalysisCharacter,
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerationDepth,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import { BOOK_ANALYSIS_CHARACTER_DIMENSION_LABELS } from "@ai-novel/shared/types/bookAnalysisCharacter";
import { CHARACTER_PROFILE_FIELD_LABELS } from "@ai-novel/shared/types/characterProfile";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
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
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_90154762")}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_6c68ddc0")}</Badge>
            {candidateCharacters.length > 0 ? <Badge variant="secondary">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_2209d75c")}</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void onIdentify()} disabled={identifyDisabled}>
                {pending.identify ? t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_c5437f5f") : characters.length > 0 ? t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_0c223f86") : t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_86de9a2c")}
              </Button>
              {candidateCharacters.length > 0 ? (
                <Button
                  size="sm"
                  onClick={() => void onGenerateAll({ generationDepth, selectedDimensions })}
                  disabled={generateAllDisabled}
                  title={batchButtonTitle}
                >
                  {pending.generateAll ? t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_4d020ba3") : `全部生成 (${pendingCandidateCount})`}
                </Button>
              ) : null}
              <SelectControl
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={generationDepth}
                onChange={(event) => setGenerationDepth(event.target.value as BookAnalysisCharacterGenerationDepth)}
                disabled={disabled || operationPending}
              >
                <option value="brief">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_2b53097b")}</option>
                <option value="standard">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_544fac40")}</option>
                <option value="deep">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_618d64f8")}</option>
                <option value="exhaustive">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_63c59813")}</option>
              </SelectControl>
            </div>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_DIMENSIONS.map((dimension) => (
                <Button
                  key={dimension}
                  size="sm"
                  variant={selectedDimensions.includes(dimension) ? "default" : "outline"}
                  onClick={() => setSelectedDimensions((current) => toggleDimension(current, dimension))}
                  disabled={disabled || operationPending}
                >
                  {BOOK_ANALYSIS_CHARACTER_DIMENSION_LABELS[dimension]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <Input
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              placeholder={t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_577c73c2")}
              disabled={disabled || pending.create}
            />
            <Input
              value={manualRole}
              onChange={(event) => setManualRole(event.target.value)}
              placeholder={t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_22cffcec")}
              disabled={disabled || pending.create}
            />
            <textarea
              className="min-h-[72px] w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={manualPersonality}
              onChange={(event) => setManualPersonality(event.target.value)}
              placeholder={t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_339e6277")}
              disabled={disabled || pending.create}
            />
            <Button size="sm" variant="outline" onClick={() => void handleCreate()} disabled={createDisabled}>
              手动添加
            </Button>
          </div>
        </div>

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
          <div className="text-sm text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_ec184058")}</div>
        ) : null}

        {!isLoading && candidateCharacters.length > 0 ? (
          <section className="rounded-md border bg-muted/20">
            <button
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-3 p-3 text-left"
              onClick={() => setCandidateExpanded((current) => !current)}
            >
              <div>
                <div className="text-sm font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_cc06e06c")}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {candidateCharacters.length} 个候选，可按需生成深度档案。
                </div>
              </div>
              <Badge variant="outline">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_1a5c3564")}</Badge>
            </button>
            {candidateExpanded ? (
              <div className="grid gap-3 border-t p-3 xl:grid-cols-2">
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

        <div className="grid gap-3 xl:grid-cols-2">
          {generatedCharacters.map((character) => {
            const isEditing = editingId === character.id && editDraft;
            return (
              <div key={character.id} className="rounded-md border p-3 text-sm">
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
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-base font-medium">{character.name}</div>
                        <div className="mt-1 text-muted-foreground">{character.role}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
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
                          基于原文访谈
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => startEdit(character)} disabled={disabled}>
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void onDelete(character.id)}
                          disabled={disabled || pending.delete}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {PROFILE_TEXT_FIELDS.map((field) => {
                        const value = character.profile[field];
                        return typeof value === "string" && value.trim() ? (
                          <div key={field} className="rounded-md bg-muted/30 p-2">
                            <div className="text-xs text-muted-foreground">{CHARACTER_PROFILE_FIELD_LABELS[field]}</div>
                            <div className="mt-1 whitespace-pre-wrap">{value}</div>
                          </div>
                        ) : null;
                      })}
                    </div>
                    {character.arcs.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <div className="font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_7a929c32")}</div>
                        {character.arcs.map((arc) => (
                          <div key={arc.id} className="rounded-md border bg-background p-2">
                            <div>{arc.stageLabel}</div>
                            {arc.chapterIndex !== null && arc.chapterIndex !== undefined ? (
                              <div className="mt-1 text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_2e1a684a")}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {character.scenes.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <div className="font-medium">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_7da599e8")}</div>
                        {character.scenes.map((scene) => (
                          <div key={scene.id} className="rounded-md border bg-background p-2">
                            <div>{scene.sceneLabel}</div>
                            {scene.sceneType ? (
                              <div className="mt-1 text-xs text-muted-foreground">{scene.sceneType}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
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
                  </>
                )}
              </div>
            );
          })}
        </div>

        {!isLoading && characters.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisCharacterPanel.gen_b90ce47e")}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
