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
import { queryKeys } from "@/api/queryKeys";

interface CharacterCastOptionsSectionProps {
  novelId: string;
  characters: Character[];
  selectedCharacter?: Character;
  onSelectedCharacterChange: (id: string) => void;
  llmProvider?: LLMProvider;
  llmModel?: string;
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

function getCastRoleLabel(castRole?: CharacterCastRole | null): string {
  if (!castRole) {
    return "未分类";
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return "未知";
  }
  return CHARACTER_GENDER_LABELS[gender] ?? gender;
}

export default function CharacterCastOptionsSection(props: CharacterCastOptionsSectionProps) {
  const { novelId, characters, selectedCharacter, onSelectedCharacterChange, llmProvider, llmModel } = props;
  const queryClient = useQueryClient();
  const [storyInput, setStoryInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isPlannerExpanded, setIsPlannerExpanded] = useState(true);

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

  const castOptions = castOptionsQuery.data?.data ?? [];
  const relations = relationsQuery.data?.data ?? [];
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
        ? "确认清空当前所有阵容方案记录？已同步的角色与关系不会自动回滚。"
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
      }),
    onSuccess: async (response) => {
      setStatusMessage(response.message ?? "角色阵容方案已生成。");
      setIsPlannerExpanded(true);
      await refreshCastOptions();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : "角色阵容方案生成失败。");
    },
  });

  const applyMutation = useMutation({
    mutationFn: (optionId: string) => applyCharacterCastOption(novelId, optionId),
    onSuccess: async (response) => {
      const primaryCharacterId = response.data?.primaryCharacterId ?? "";
      if (primaryCharacterId) {
        onSelectedCharacterChange(primaryCharacterId);
      }
      setStatusMessage(
        response.message
        ?? `已同步 ${response.data?.createdCount ?? 0} 个新角色，更新 ${response.data?.updatedCount ?? 0} 个既有角色。`,
      );
      setIsPlannerExpanded(false);
      await refreshAppliedCharacterWorkspace();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : "角色阵容方案应用失败。");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (optionId: string) => deleteCharacterCastOption(novelId, optionId),
    onSuccess: async (response) => {
      if (response.data?.deletedAppliedOption) {
        setStatusMessage("方案记录已删除；之前已同步到角色库和关系网的数据不会自动回滚。");
      } else {
        setStatusMessage("这套阵容方案已删除。");
      }
      await refreshCastOptions();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : "删除阵容方案失败。");
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearCharacterCastOptions(novelId),
    onSuccess: async (response) => {
      const deletedCount = response.data?.deletedCount ?? 0;
      const deletedAppliedCount = response.data?.deletedAppliedCount ?? 0;
      if (deletedCount === 0) {
        setStatusMessage("当前没有可清空的阵容方案。");
      } else if (deletedAppliedCount > 0) {
        setStatusMessage(`已清空 ${deletedCount} 套阵容方案记录；已同步的角色与关系不会自动回滚。`);
      } else {
        setStatusMessage(`已清空 ${deletedCount} 套阵容方案。`);
      }
      setIsPlannerExpanded(true);
      await refreshCastOptions();
    },
    onError: (error) => {
      setStatusMessage(error instanceof Error ? error.message : "清空阵容方案失败。");
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
              <CardTitle>AI 角色阵容方案</CardTitle>
              <div className="text-sm text-muted-foreground">
                更适合前期搭建角色系统，或在故事方向大改后重新规划阵容。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{castOptions.length} 套候选方案</Badge>
              <Badge variant="outline">{relations.length} 条结构化关系</Badge>
              {appliedOption ? <Badge variant="secondary">已应用方案</Badge> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {appliedOption && !isPlannerExpanded ? (
            <div className="grid gap-4 rounded-2xl border border-border/70 bg-background/80 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium">{appliedOption.title}</div>
                  <Badge variant="secondary">当前生效</Badge>
                </div>
                <div className="text-sm text-muted-foreground">{appliedOption.summary}</div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{appliedOption.members.length} 个核心角色</span>
                  <span>{appliedOption.relations.length} 条关键关系</span>
                  {appliedOption.recommendedReason ? <span>推荐：{appliedOption.recommendedReason}</span> : null}
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
                    <div className="text-sm font-medium">生成指令</div>
                    <div className="text-xs text-muted-foreground">
                      可补充主角欲望、对手压力、关系张力，或你想重点强化的人物方向。
                    </div>
                  </div>
                  <textarea
                    className="min-h-[140px] w-full rounded-xl border bg-background p-3 text-sm"
                    placeholder="例如：主角必须在家族责任与个人自由之间二选一；反派不要是纯恶，而是带有保护欲和控制欲。"
                    value={storyInput}
                    onChange={(event) => setStoryInput(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <AiButton onClick={() => generateMutation.mutate()} disabled={isWorking}>
                      {generateMutation.isPending ? "生成中..." : "生成 3 套阵容"}
                    </AiButton>
                    {castOptions.length > 0 ? (
                      <Button variant="outline" onClick={handleRejectAll} disabled={isWorking}>
                        {clearMutation.isPending ? "清空中..." : "都不喜欢"}
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
                    {castOptions.map((option) => (
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
                              {option.status === "applied" ? <Badge variant="secondary">已应用</Badge> : null}
                              {option.recommendedReason ? <Badge variant="outline">推荐</Badge> : null}
                            </div>
                            <div className="text-xs leading-5 text-muted-foreground">{option.summary}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => applyMutation.mutate(option.id)}
                              disabled={isWorking}
                              variant={option.status === "applied" ? "outline" : "default"}
                            >
                              {option.status === "applied"
                                ? "重新应用"
                                : applyMutation.isPending
                                  ? "应用中..."
                                  : "应用这套阵容"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteOption(option)}
                              disabled={isWorking}
                            >
                              {deleteMutation.isPending && deleteMutation.variables === option.id ? "删除中..." : "删除"}
                            </Button>
                          </div>
                        </div>
                        {option.recommendedReason ? (
                          <div className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 text-xs text-muted-foreground">
                            推荐理由：{option.recommendedReason}
                          </div>
                        ) : null}
                        {option.whyItWorks ? (
                          <div className="mt-2 text-xs text-muted-foreground">成立原因：{option.whyItWorks}</div>
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
                              <div className="mt-2 text-xs text-muted-foreground">作用：{member.storyFunction}</div>
                              {member.relationToProtagonist ? (
                                <div className="text-xs text-muted-foreground">
                                  与主角关系：{member.relationToProtagonist}
                                </div>
                              ) : null}
                              {member.outerGoal ? (
                                <div className="text-xs text-muted-foreground">外在目标：{member.outerGoal}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
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
          <CardTitle>结构化关系网</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {selectedCharacter ? (
            <div className="text-xs text-muted-foreground">
              当前聚焦：{selectedCharacter.name}（{selectedCharacter.role || "未定义"}）
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">未选中角色时，默认展示最近的关系条目。</div>
          )}
          {relationsQuery.isLoading ? (
            <div className="text-muted-foreground">正在加载关系网络...</div>
          ) : filteredRelations.length > 0 ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {filteredRelations.map((relation) => {
                const selectedIsSource = selectedCharacter ? relation.sourceCharacterId === selectedCharacter.id : false;
                const counterpartId = selectedIsSource ? relation.targetCharacterId : relation.sourceCharacterId;
                const counterpartName = selectedIsSource
                  ? relation.targetCharacterName || characterNameById.get(counterpartId) || "未命名角色"
                  : relation.sourceCharacterName || characterNameById.get(counterpartId) || "未命名角色";
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
                      <div className="mt-2 text-xs text-muted-foreground">隐藏张力：{relation.hiddenTension}</div>
                    ) : null}
                    {relation.conflictSource ? (
                      <div className="text-xs text-muted-foreground">冲突来源：{relation.conflictSource}</div>
                    ) : null}
                    {relation.nextTurnPoint ? (
                      <div className="text-xs text-muted-foreground">下一反转点：{relation.nextTurnPoint}</div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-muted-foreground">
              当前还没有结构化关系。应用一套角色阵容后会在这里出现。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
