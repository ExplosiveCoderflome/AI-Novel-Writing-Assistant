import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, CharacterCastOption, CharacterCastRole, CharacterGender } from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  applyCharacterCastOption,
  clearCharacterCastOptions,
  deleteCharacterCastOption,
  generateCharacterCastOptions,
  getCharacterCastOptions,
  getCharacterRelations,
} from "@/api/novel";
import { getNovelWorldSlice } from "@/api/novelWorldSlice";
import { queryKeys } from "@/api/queryKeys";
import SelectControl from "@/components/common/SelectControl";

interface CharacterCastOptionsSectionProps {
  novelId: string;
  characters: Character[];
  selectedCharacter?: Character;
  onSelectedCharacterChange: (id: string) => void;
  llmProvider?: LLMProvider;
  llmModel?: string;
}

const CAST_ROLE_LABELS: Record<CharacterCastRole, string> = {
  protagonist: "main character",
  antagonist: "main opponent",
  ally: "alliance",
  foil: "mirror role",
  mentor: "tutor",
  love_interest: "emotional pull",
  pressure_source: "stressor",
  catalyst: "Catalyst",
};

const CHARACTER_GENDER_LABELS: Record<CharacterGender, string> = {
  male: "male",
  female: "female",
  other: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  unknown: "unknown",
};

function getCastRoleLabel(castRole?: CharacterCastRole | null): string {
  if (!castRole) {
    return "Uncategorized";
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return "unknown";
  }
  return CHARACTER_GENDER_LABELS[gender] ?? gender;
}

function getCharacterCastQualityWarnings(option: CharacterCastOption): string[] {
  const assessment = option.qualityAssessment;
  if (!assessment || assessment.autoApplicable) {
    return [];
  }
  const issueMessages = Array.from(
    new Set(assessment.issues.map((issue) => issue.message).filter((message) => message.trim().length > 0)),
  );
  if (issueMessages.length > 0) {
    return issueMessages;
  }
  return assessment.blockingReasons;
}

function buildCharacterCastApplyConfirmMessage(option: CharacterCastOption, warnings: string[]): string {
  const warningText = warnings
    .slice(0, 4)
    .map((warning, index) => `${index + 1}. ${warning}`)
    .join("\n");
  return [
    `阵容「${option.title}」和当前故事设定还有不完全匹配的地方。`,
    warningText,
    "Still applied to the Character Asset Workbench? After application, you can continue to adjust it in the character assets.",
  ].filter((line) => line.trim().length > 0).join("\n\n");
}

export default function CharacterCastOptionsSection(props: CharacterCastOptionsSectionProps) {
  const { novelId, characters, selectedCharacter, onSelectedCharacterChange, llmProvider, llmModel } = props;
  const queryClient = useQueryClient();
  const [storyInput, setStoryInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isPlannerExpanded, setIsPlannerExpanded] = useState(true);
  const [useWorldContext, setUseWorldContext] = useState(true);
  const [preferredWorldFaction, setPreferredWorldFaction] = useState("");
  const [forceWorldCompliance, setForceWorldCompliance] = useState(true);

  const castOptionsQuery = useQuery({
    queryKey: queryKeys.novels.characterCastOptions(novelId),
    queryFn: () => getCharacterCastOptions(novelId),
    enabled: Boolean(novelId),
  });

  const relationsQuery = useQuery({
    queryKey: queryKeys.novels.characterRelations(novelId),
    queryFn: () => getCharacterRelations(novelId),
    enabled: Boolean(novelId),
  });

  const worldSliceQuery = useQuery({
    queryKey: queryKeys.novels.worldSlice(novelId),
    queryFn: () => getNovelWorldSlice(novelId),
    enabled: Boolean(novelId) && useWorldContext,
  });

  const castOptions = castOptionsQuery.data?.data ?? [];
  const relations = relationsQuery.data?.data ?? [];
  const worldSliceView = worldSliceQuery.data?.data;
  const hasUsableWorld = Boolean(worldSliceView?.hasWorld);
  const hasWorldSlice = Boolean(worldSliceView?.slice);
  const activeWorldForces = worldSliceQuery.data?.data?.slice?.activeForces ?? [];
  const appliedOption = useMemo(
    () => castOptions.find((option) => option.status === "applied") ?? null,
    [castOptions],
  );
  const characterNameById = useMemo(
    () => new Map(characters.map((character) => [character.id, character.name])),
    [characters],
  );

  useEffect(() => {
    setIsPlannerExpanded(appliedOption == null);
  }, [appliedOption?.id]);

  async function refreshCastOptions() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCastOptions(novelId) });
  }

  async function refreshAppliedCharacterWorkspace() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCastOptions(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterRelations(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterDynamicsOverview(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCandidates(novelId) }),
    ]);
  }

  function handleDeleteOption(option: CharacterCastOption) {
    const confirmed = window.confirm(
      option.status === "applied"
        ? `确认删除方案「${option.title}」？这只会删除方案记录，不会回滚已同步的角色与关系。`
        : `确认删除方案「${option.title}」？`,
    );
    if (!confirmed) {
      return;
    }
    deleteMutation.mutate(option.id);
  }

  function handleRejectAll() {
    const confirmed = window.confirm(
      appliedOption
        ? "Confirm to clear all current lineup plan records? Synchronized roles and relationships will not be automatically rolled back."
        : `确认清空当前 ${castOptions.length} 套阵容方案？`,
    );
    if (!confirmed) {
      return;
    }
    clearMutation.mutate();
  }

  const filteredRelations = useMemo(() => {
    if (!selectedCharacter) {
      return relations.slice(0, 8);
    }
    return relations.filter(
      (relation) => relation.sourceCharacterId === selectedCharacter.id || relation.targetCharacterId === selectedCharacter.id,
    );
  }, [relations, selectedCharacter]);

  const generateMutation = useMutation({
    mutationFn: () =>
      generateCharacterCastOptions(novelId, {
        provider: llmProvider,
        model: llmModel,
        temperature: 0.6,
        storyInput: storyInput.trim() || undefined,
        useWorldContext,
        worldFocusHints: useWorldContext
          ? {
            preferFaction: preferredWorldFaction || undefined,
            forceCompliance: forceWorldCompliance,
          }
          : undefined,
      }),
    onSuccess: async (response) => {
      setStatusMessage(response.message ?? "The character lineup plan has been generated.");
      setIsPlannerExpanded(true);
      await refreshCastOptions();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : "Character lineup plan generation failed.");
    },
  });

  const applyMutation = useMutation({
    mutationFn: (input: { optionId: string; overrideQualityGate?: boolean }) => (
      applyCharacterCastOption(novelId, input.optionId, {
        overrideQualityGate: input.overrideQualityGate,
        provider: llmProvider,
        model: llmModel,
        temperature: 0.45,
      })
    ),
    onSuccess: async (response) => {
      const primaryCharacterId = response.data?.primaryCharacterId ?? "";
      if (primaryCharacterId) {
        onSelectedCharacterChange(primaryCharacterId);
      }
      const createdCount = response.data?.createdCount ?? 0;
      const updatedCount = response.data?.updatedCount ?? 0;
      const backgroundHint = "Explicit information and character dynamics will be completed in the background, and you can view them by refreshing the character assets later.";
      setStatusMessage(
        response.data?.qualityOverrideApplied
          ? `已按你的确认应用这套阵容，同步 ${createdCount} 个新角色，更新 ${updatedCount} 个既有角色。${backgroundHint}`
          : `${response.message ?? `已同步 ${createdCount} 个新角色，更新 ${updatedCount} 个既有角色。`}${backgroundHint}`,
      );
      setIsPlannerExpanded(false);
      await refreshAppliedCharacterWorkspace();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : "Role lineup scheme application failed.");
    },
  });

  function handleApplyOption(option: CharacterCastOption) {
    const qualityWarnings = getCharacterCastQualityWarnings(option);
    if (qualityWarnings.length > 0) {
      const confirmed = window.confirm(buildCharacterCastApplyConfirmMessage(option, qualityWarnings));
      if (!confirmed) {
        return;
      }
      applyMutation.mutate({ optionId: option.id, overrideQualityGate: true });
      return;
    }
    applyMutation.mutate({ optionId: option.id });
  }

  const deleteMutation = useMutation({
    mutationFn: (optionId: string) => deleteCharacterCastOption(novelId, optionId),
    onSuccess: async (response) => {
      if (response.data?.deletedAppliedOption) {
        setStatusMessage("The plan record has been deleted; the corresponding data in the role library and relationship network will be retained.");
      } else {
        setStatusMessage("This lineup plan has been deleted.");
      }
      await refreshCastOptions();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : "Failed to delete lineup plan.");
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearCharacterCastOptions(novelId),
    onSuccess: async (response) => {
      const deletedCount = response.data?.deletedCount ?? 0;
      const deletedAppliedCount = response.data?.deletedAppliedCount ?? 0;
      if (deletedCount === 0) {
        setStatusMessage("There are no lineup plans to clear.");
      } else if (deletedAppliedCount > 0) {
        setStatusMessage(`已清空 ${deletedCount} 套阵容方案记录；已同步的角色与关系不会自动回滚。`);
      } else {
        setStatusMessage(`已清空 ${deletedCount} 套阵容方案。`);
      }
      setIsPlannerExpanded(true);
      await refreshCastOptions();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : "The plan to clear the lineup failed.");
    },
  });
  const isWorking =
    generateMutation.isPending
    || applyMutation.isPending
    || deleteMutation.isPending
    || clearMutation.isPending;

  return (
    <div className="space-y-4">
      <Card className={appliedOption && !isPlannerExpanded ? "border-border/60 bg-muted/15" : ""}>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <CardTitle>AI character lineup plan</CardTitle>
              <div className="text-sm text-muted-foreground">
                It is more suitable for building a character system in the early stage, or re-planning the lineup after a major change in the direction of the story.
                                            </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{castOptions.length} set of candidates</Badge>
              <Badge variant="outline">{relations.length} role relationship</Badge>
              {appliedOption ? <Badge variant="secondary">Applied scheme</Badge> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {appliedOption && !isPlannerExpanded ? (
            <div className="grid gap-4 rounded-2xl border border-border/70 bg-background/80 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium">{appliedOption.title}</div>
                  <Badge variant="secondary">Currently effective</Badge>
                </div>
                <div className="text-sm text-muted-foreground">{appliedOption.summary}</div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{appliedOption.members.length} core role</span>
                  <span>{appliedOption.relations.length} key relationships</span>
                  {appliedOption.recommendedReason ? <span>recommend:{appliedOption.recommendedReason}</span> : null}
                </div>
                {statusMessage ? <div className="text-xs text-muted-foreground">{statusMessage}</div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setIsPlannerExpanded(true)}>
                  See the rest of the options
                                                  </Button>
                <Button variant="secondary" onClick={() => setIsPlannerExpanded(true)}>
                  Re-planning the lineup
                                                  </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
                <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Generate instructions</div>
                    <div className="text-xs text-muted-foreground">
                      It can supplement the protagonist's desire, opponent's pressure, relationship tension, or the character direction you want to focus on strengthening.
                                                                  </div>
                  </div>
                  <textarea
                    className="min-h-[140px] w-full rounded-xl border bg-background p-3 text-sm"
                    placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                    value={storyInput}
                    onChange={(event) => setStoryInput(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={useWorldContext}
                        onChange={(event) => setUseWorldContext(event.target.checked)}
                      />
                      Generate a world based on this book
                                                                  </label>
                    {useWorldContext ? (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={forceWorldCompliance}
                          onChange={(event) => setForceWorldCompliance(event.target.checked)}
                        />
                        Check World Rules Compliance
                                                                        </label>
                    ) : null}
                  </div>
                  {useWorldContext ? (
                    <div className="grid gap-2 rounded-xl border border-border/70 bg-background/80 p-3 text-xs text-muted-foreground">
                      {worldSliceQuery.isLoading ? (
                        <div>Reading this book world usage scope...</div>
                      ) : !hasUsableWorld ? (
                        <div>
                          The book world is not ready yet. In this round, priority will be given to character design based on book-level information and your generation instructions.
                                                                                  </div>
                      ) : !hasWorldSlice ? (
                        <div>
                          The world of this book exists, but its scope of use has not yet been sorted out. It is recommended to first go to the basic information page to sort out the scope of use of this book, or continue to let the AI ​​generate it conservatively according to the world manual.
                                                                                      </div>
                      ) : null}
                      <label className="space-y-1">
                        <span className="font-medium text-foreground">sectarian tendencies</span>
                        <SelectControl
                          className="w-full rounded-md border bg-background p-2 text-sm"
                          value={preferredWorldFaction}
                          onChange={(event) => setPreferredWorldFaction(event.target.value)}
                          disabled={!hasWorldSlice || activeWorldForces.length === 0}
                        >
                          <option value="">Judged by AI</option>
                          {activeWorldForces.map((force) => (
                            <option key={force.id} value={force.name}>{force.name}</option>
                          ))}
                        </SelectControl>
                      </label>
                      <div>
                        {hasWorldSlice
                          ? "Characters will give priority to the forces, locations, identity boundaries and prohibited combinations in the world of this book."
                          : "After the world usage scope of this book is sorted out, the influence tendency can be further specified."}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <AiButton onClick={() => generateMutation.mutate()} disabled={isWorking}>
                      {generateMutation.isPending ? "Generating..." : "Generate 3 lineups"}
                    </AiButton>
                    {castOptions.length > 0 ? (
                      <Button variant="outline" onClick={handleRejectAll} disabled={isWorking}>
                        {clearMutation.isPending ? "Clear the air..." : "Don't like it"}
                      </Button>
                    ) : null}
                    {appliedOption ? (
                      <Button variant="outline" onClick={() => setIsPlannerExpanded(false)} disabled={isWorking}>
                        Collapse plan area
                                                                        </Button>
                    ) : null}
                  </div>
                  <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                    After applying a certain lineup, characters will be created/updated simultaneously and the character asset workbench will be refreshed.
                                                            </div>
                  {statusMessage ? (
                    <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-xs text-muted-foreground">
                      {statusMessage}
                    </div>
                  ) : null}
                </div>

                {castOptionsQuery.isLoading ? (
                  <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
                    Loading lineup plan...
                                                            </div>
                ) : castOptions.length > 0 ? (
                  <div className="grid gap-3 2xl:grid-cols-2">
                    {castOptions.map((option) => {
                      const qualityWarnings = getCharacterCastQualityWarnings(option);
                      const requiresQualityConfirmation = qualityWarnings.length > 0;
                      const isApplyingThisOption = applyMutation.isPending && applyMutation.variables?.optionId === option.id;
                      return (
                        <div
                          key={option.id}
                          className={`rounded-2xl border p-4 ${
                            option.status === "applied" ? "border-emerald-500/40 bg-emerald-50/40" : ""
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium">{option.title}</div>
                                {option.status === "applied" ? <Badge variant="secondary">Applied</Badge> : null}
                                {option.recommendedReason ? <Badge variant="outline">recommend</Badge> : null}
                                {requiresQualityConfirmation ? <Badge variant="outline">Confirmation required</Badge> : null}
                              </div>
                              <div className="text-xs leading-5 text-muted-foreground">{option.summary}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApplyOption(option)}
                                disabled={isWorking}
                                variant={option.status === "applied" ? "outline" : "default"}
                              >
                                {isApplyingThisOption
                                  ? "Applying..."
                                  : option.status === "applied"
                                    ? "reapply"
                                    : requiresQualityConfirmation
                                      ? "Apply after confirmation"
                                      : "Apply this lineup"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteOption(option)}
                                disabled={isWorking}
                              >
                                {deleteMutation.isPending && deleteMutation.variables === option.id ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "delete"}
                              </Button>
                            </div>
                          </div>
                          {requiresQualityConfirmation ? (
                            <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50/70 p-3 text-xs text-amber-900">
                              <div className="font-medium">This lineup requires your confirmation before applying it</div>
                              <div className="mt-1">
                                The system found that it did not completely match the current story settings. You can apply it first and then adjust it in the character assets.
                                                                        </div>
                              <ul className="mt-2 list-disc space-y-1 pl-4">
                                {qualityWarnings.slice(0, 3).map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {option.recommendedReason ? (
                            <div className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 text-xs text-muted-foreground">
                              Reasons for recommendation:{option.recommendedReason}
                            </div>
                          ) : null}
                          {option.whyItWorks ? (
                            <div className="mt-2 text-xs text-muted-foreground">Reasons for establishment:{option.whyItWorks}</div>
                          ) : null}
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {option.members.map((member) => (
                              <div key={member.id} className="rounded-xl border border-dashed p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{member.name}</span>
                                  <Badge variant="outline">{getCastRoleLabel(member.castRole)}</Badge>
                                  <Badge variant="secondary">{getCharacterGenderLabel(member.gender)}</Badge>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">{member.role}</div>
                                <div className="mt-2 text-xs text-muted-foreground">effect:{member.storyFunction}</div>
                                {member.relationToProtagonist ? (
                                  <div className="text-xs text-muted-foreground">
                                    Relationship with the protagonist:{member.relationToProtagonist}
                                  </div>
                                ) : null}
                                {member.outerGoal ? (
                                  <div className="text-xs text-muted-foreground">External goals:{member.outerGoal}</div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed px-6 text-center text-sm text-muted-foreground">
                    There is no lineup plan yet. First enter a bit of character direction, then click "Generate 3 lineups".
                                                                    </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>role network</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {selectedCharacter ? (
            <div className="text-xs text-muted-foreground">
              Current focus:{selectedCharacter.name}（{selectedCharacter.role || "undefined"}）
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">When the role is not selected, the most recent relationship entries are displayed by default.</div>
          )}
          {relationsQuery.isLoading ? (
            <div className="text-muted-foreground">Loading relationship network...</div>
          ) : filteredRelations.length > 0 ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {filteredRelations.map((relation) => {
                const selectedIsSource = selectedCharacter ? relation.sourceCharacterId === selectedCharacter.id : false;
                const counterpartId = selectedIsSource ? relation.targetCharacterId : relation.sourceCharacterId;
                const counterpartName = selectedIsSource
                  ? relation.targetCharacterName || characterNameById.get(counterpartId) || "unnamed role"
                  : relation.sourceCharacterName || characterNameById.get(counterpartId) || "unnamed role";
                return (
                  <button
                    key={relation.id}
                    type="button"
                    className="w-full rounded-xl border p-3 text-left transition hover:border-primary/40 hover:bg-muted/30"
                    onClick={() => {
                      if (counterpartId) {
                        onSelectedCharacterChange(counterpartId);
                      }
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{counterpartName}</div>
                      <Badge variant="outline">{relation.surfaceRelation}</Badge>
                    </div>
                    {relation.hiddenTension ? (
                      <div className="mt-2 text-xs text-muted-foreground">Hidden tension:{relation.hiddenTension}</div>
                    ) : null}
                    {relation.conflictSource ? (
                      <div className="text-xs text-muted-foreground">Source of conflict:{relation.conflictSource}</div>
                    ) : null}
                    {relation.nextTurnPoint ? (
                      <div className="text-xs text-muted-foreground">Next reversal point:{relation.nextTurnPoint}</div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-muted-foreground">
              Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                                              </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
