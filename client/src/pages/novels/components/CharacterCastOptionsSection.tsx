import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
  protagonist: t("gen.pages.novels.components.CharacterCastOptionsSection.mainCharacter"),
  antagonist: t("gen.pages.novels.components.CharacterCastOptionsSection.mainEnemy"),
  ally: t("gen.pages.novels.components.CharacterCastOptionsSection.gen_9669fc43"),
  foil: t("gen.pages.novels.components.CharacterCastOptionsSection.gen_d7fc88ac"),
  mentor: t("gen.pages.novels.components.CharacterCastOptionsSection.gen_d62518be"),
  love_interest: t("gen.pages.novels.components.CharacterCastOptionsSection.gen_65c52a7e"),
  pressure_source: t("gen.pages.novels.components.CharacterCastOptionsSection.gen_7aa91c6c"),
  catalyst: t("gen.pages.novels.components.CharacterCastOptionsSection.gen_f57197c6"),
};

const CHARACTER_GENDER_LABELS: Record<CharacterGender, string> = {
  male: t("gen.pages.novels.components.CharacterCastOptionsSection.gen_36a4908a"),
  female: t("gen.pages.novels.components.CharacterCastOptionsSection.gen_87c835a6"),
  other: t("gen.pages.novels.components.CharacterCastOptionsSection.gen_0d98c747"),
  unknown: t("gen.pages.novels.components.CharacterCastOptionsSection.gen_1622dc9b"),
};

function getCastRoleLabel(castRole?: CharacterCastRole | null): string {
  if (!castRole) {
    return t("gen.pages.novels.components.CharacterCastOptionsSection.gen_ecf7ebb5");
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return t("gen.pages.novels.components.CharacterCastOptionsSection.gen_1622dc9b");
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
    t("gen.pages.novels.components.CharacterCastOptionsSection.stillApplyToAssetWorkshop"),
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
        ? t("gen.pages.novels.components.CharacterCastOptionsSection.gen_a3322cb5")
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
      setStatusMessage(response.message ?? t("gen.pages.novels.components.CharacterCastOptionsSection.gen_9c59d01a"));
      setIsPlannerExpanded(true);
      await refreshCastOptions();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : t("gen.pages.novels.components.CharacterCastOptionsSection.gen_9d18891f"));
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
      const backgroundHint = t("gen.pages.novels.components.CharacterCastOptionsSection.gen_e12b44f1");
      setStatusMessage(
        response.data?.qualityOverrideApplied
          ? `已按你的确认应用这套阵容，同步 ${createdCount} 个新角色，更新 ${updatedCount} 个既有角色。${backgroundHint}`
          : `${response.message ?? `已同步 ${createdCount} 个新角色，更新 ${updatedCount} 个既有角色。`}${backgroundHint}`,
      );
      setIsPlannerExpanded(false);
      await refreshAppliedCharacterWorkspace();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : t("gen.pages.novels.components.CharacterCastOptionsSection.gen_b1c5d2c4"));
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
        setStatusMessage(t("gen.pages.novels.components.CharacterCastOptionsSection.gen_e0c743d7"));
      } else {
        setStatusMessage(t("gen.pages.novels.components.CharacterCastOptionsSection.gen_815a0232"));
      }
      await refreshCastOptions();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : t("gen.pages.novels.components.CharacterCastOptionsSection.gen_cec28e2d"));
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearCharacterCastOptions(novelId),
    onSuccess: async (response) => {
      const deletedCount = response.data?.deletedCount ?? 0;
      const deletedAppliedCount = response.data?.deletedAppliedCount ?? 0;
      if (deletedCount === 0) {
        setStatusMessage(t("gen.pages.novels.components.CharacterCastOptionsSection.gen_82c3bdac"));
      } else if (deletedAppliedCount > 0) {
        setStatusMessage(`已清空 ${deletedCount} 套阵容方案记录；已同步的角色与关系不会自动回滚。`);
      } else {
        setStatusMessage(`已清空 ${deletedCount} 套阵容方案。`);
      }
      setIsPlannerExpanded(true);
      await refreshCastOptions();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : t("gen.pages.novels.components.CharacterCastOptionsSection.gen_2330d8fd"));
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
              <CardTitle>{t("gen.pages.novels.components.CharacterCastOptionsSection.aiCharacterLineupPlan")}</CardTitle>
              <div className="text-sm text-muted-foreground">
                更适合前期搭建角色系统，或在故事方向大改后重新规划阵容。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{t("gen.pages.novels.components.CharacterCastOptionsSection.castOptionCount")}</Badge>
              <Badge variant="outline">{t("gen.pages.novels.components.CharacterCastOptionsSection.relationshipCount")}</Badge>
              {appliedOption ? <Badge variant="secondary">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_331e0006")}</Badge> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {appliedOption && !isPlannerExpanded ? (
            <div className="grid gap-4 rounded-2xl border border-border/70 bg-background/80 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium">{appliedOption.title}</div>
                  <Badge variant="secondary">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_4298a6d6")}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">{appliedOption.summary}</div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{t("gen.pages.novels.components.CharacterCastOptionsSection.coreCharactersCount")}</span>
                  <span>{t("gen.pages.novels.components.CharacterCastOptionsSection.keyRelationsCount")}</span>
                  {appliedOption.recommendedReason ? <span>{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_c44fe03f")}</span> : null}
                </div>
                {statusMessage ? <div className="text-xs text-muted-foreground">{statusMessage}</div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setIsPlannerExpanded(true)}>
                  查看其余方案
                </Button>
                <Button variant="secondary" onClick={() => setIsPlannerExpanded(true)}>
                  重新规划阵容
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
                <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_eba49f80")}</div>
                    <div className="text-xs text-muted-foreground">
                      可补充主角欲望、对手压力、关系张力，或你想重点强化的人物方向。
                    </div>
                  </div>
                  <textarea
                    className="min-h-[140px] w-full rounded-xl border bg-background p-3 text-sm"
                    placeholder={t("gen.pages.novels.components.CharacterCastOptionsSection.exampleMainChooseFamilyOrFreedomEvilNotPureControl")}
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
                      基于本书世界生成
                    </label>
                    {useWorldContext ? (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={forceWorldCompliance}
                          onChange={(event) => setForceWorldCompliance(event.target.checked)}
                        />
                        检查世界规则合规
                      </label>
                    ) : null}
                  </div>
                  {useWorldContext ? (
                    <div className="grid gap-2 rounded-xl border border-border/70 bg-background/80 p-3 text-xs text-muted-foreground">
                      {worldSliceQuery.isLoading ? (
                        <div>{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_1eb86022")}</div>
                      ) : !hasUsableWorld ? (
                        <div>
                          本书世界还没有准备好。本轮会优先根据书级信息和你的生成指令设计角色。
                        </div>
                      ) : !hasWorldSlice ? (
                        <div>
                          本书世界存在，但使用范围还未整理。建议先到基础信息页整理本书使用范围，或继续让 AI 按世界手册保守生成。
                        </div>
                      ) : null}
                      <label className="space-y-1">
                        <span className="font-medium text-foreground">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_368e1d5d")}</span>
                        <SelectControl
                          className="w-full rounded-md border bg-background p-2 text-sm"
                          value={preferredWorldFaction}
                          onChange={(event) => setPreferredWorldFaction(event.target.value)}
                          disabled={!hasWorldSlice || activeWorldForces.length === 0}
                        >
                          <option value="">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_03b5582c")}</option>
                          {activeWorldForces.map((force) => (
                            <option key={force.id} value={force.name}>{force.name}</option>
                          ))}
                        </SelectControl>
                      </label>
                      <div>
                        {hasWorldSlice
                          ? t("gen.pages.novels.components.CharacterCastOptionsSection.gen_da93cd04")
                          : t("gen.pages.novels.components.CharacterCastOptionsSection.gen_349b40cf")}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <AiButton onClick={() => generateMutation.mutate()} disabled={isWorking}>
                      {generateMutation.isPending ? t("gen.pages.novels.components.CharacterCastOptionsSection.gen_4d020ba3") : t("gen.pages.novels.components.CharacterCastOptionsSection.gen_75886390")}
                    </AiButton>
                    {castOptions.length > 0 ? (
                      <Button variant="outline" onClick={handleRejectAll} disabled={isWorking}>
                        {clearMutation.isPending ? t("gen.pages.novels.components.CharacterCastOptionsSection.gen_67b24f4b") : t("gen.pages.novels.components.CharacterCastOptionsSection.gen_2b60475a")}
                      </Button>
                    ) : null}
                    {appliedOption ? (
                      <Button variant="outline" onClick={() => setIsPlannerExpanded(false)} disabled={isWorking}>
                        收起方案区
                      </Button>
                    ) : null}
                  </div>
                  <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                    应用某套阵容后，会同步创建/更新角色，并刷新角色资产工作台。
                  </div>
                  {statusMessage ? (
                    <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-xs text-muted-foreground">
                      {statusMessage}
                    </div>
                  ) : null}
                </div>

                {castOptionsQuery.isLoading ? (
                  <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
                    正在加载阵容方案...
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
                                {option.status === "applied" ? <Badge variant="secondary">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_1463e88d")}</Badge> : null}
                                {option.recommendedReason ? <Badge variant="outline">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_3f981012")}</Badge> : null}
                                {requiresQualityConfirmation ? <Badge variant="outline">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_bf45ca6e")}</Badge> : null}
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
                                  ? t("gen.pages.novels.components.CharacterCastOptionsSection.gen_e596edd9")
                                  : option.status === "applied"
                                    ? t("gen.pages.novels.components.CharacterCastOptionsSection.gen_118d4b70")
                                    : requiresQualityConfirmation
                                      ? t("gen.pages.novels.components.CharacterCastOptionsSection.gen_6bef564c")
                                      : t("gen.pages.novels.components.CharacterCastOptionsSection.gen_a52ee018")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteOption(option)}
                                disabled={isWorking}
                              >
                                {deleteMutation.isPending && deleteMutation.variables === option.id ? t("gen.pages.novels.components.CharacterCastOptionsSection.gen_09f2fb82") : t("gen.pages.novels.components.CharacterCastOptionsSection.gen_2f4aaddd")}
                              </Button>
                            </div>
                          </div>
                          {requiresQualityConfirmation ? (
                            <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50/70 p-3 text-xs text-amber-900">
                              <div className="font-medium">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_f3e41c8b")}</div>
                              <div className="mt-1">
                                系统发现它和当前故事设定还有不完全匹配的地方。你可以先应用，再到角色资产里调整。
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
                              推荐理由：{option.recommendedReason}
                            </div>
                          ) : null}
                          {option.whyItWorks ? (
                            <div className="mt-2 text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_d291d983")}</div>
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
                                <div className="mt-2 text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterCastOptionsSection.functionMemberStoryFunction")}</div>
                                {member.relationToProtagonist ? (
                                  <div className="text-xs text-muted-foreground">
                                    与主角关系：{member.relationToProtagonist}
                                  </div>
                                ) : null}
                                {member.outerGoal ? (
                                  <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_f967d503")}</div>
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
                    还没有阵容方案。先输入一点人物方向，再点击“生成 3 套阵容”。
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_6606fcbf")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {selectedCharacter ? (
            <div className="text-xs text-muted-foreground">
              当前聚焦：{selectedCharacter.name}（{selectedCharacter.role || t("gen.pages.novels.components.CharacterCastOptionsSection.gen_cebc6bbb")}）
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_17397de3")}</div>
          )}
          {relationsQuery.isLoading ? (
            <div className="text-muted-foreground">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_1f00d3fa")}</div>
          ) : filteredRelations.length > 0 ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {filteredRelations.map((relation) => {
                const selectedIsSource = selectedCharacter ? relation.sourceCharacterId === selectedCharacter.id : false;
                const counterpartId = selectedIsSource ? relation.targetCharacterId : relation.sourceCharacterId;
                const counterpartName = selectedIsSource
                  ? relation.targetCharacterName || characterNameById.get(counterpartId) || t("gen.pages.novels.components.CharacterCastOptionsSection.gen_f9157038")
                  : relation.sourceCharacterName || characterNameById.get(counterpartId) || t("gen.pages.novels.components.CharacterCastOptionsSection.gen_f9157038");
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
                      <div className="mt-2 text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_517ccc87")}</div>
                    ) : null}
                    {relation.conflictSource ? (
                      <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterCastOptionsSection.gen_5e01ec63")}</div>
                    ) : null}
                    {relation.nextTurnPoint ? (
                      <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.CharacterCastOptionsSection.nextReversalPoint")}</div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-muted-foreground">
              还没有角色关系。应用一套角色阵容后会在这里出现。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
