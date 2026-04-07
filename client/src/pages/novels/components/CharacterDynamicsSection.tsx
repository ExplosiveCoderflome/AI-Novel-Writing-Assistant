import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  confirmCharacterCandidate,
  getCharacterCandidates,
  getCharacterDynamicsOverview,
  mergeCharacterCandidate,
  rebuildCharacterDynamics,
  updateCharacterDynamicState,
} from "@/api/novelCharacterDynamics";
import { queryKeys } from "@/api/queryKeys";

type DynamicsView = "overview" | "candidates" | "relations" | "duties";

interface CharacterDynamicsSectionProps {
  novelId: string;
  selectedCharacter?: Character;
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
}

function riskTone(risk: "none" | "info" | "warn" | "high"): string {
  switch (risk) {
    case "high":
      return "border-rose-300/70 bg-rose-50 text-rose-700";
    case "warn":
      return "border-amber-300/70 bg-amber-50 text-amber-700";
    case "info":
      return "border-sky-300/70 bg-sky-50 text-sky-700";
    default:
      return "border-border/70 bg-background text-muted-foreground";
  }
}

export default function CharacterDynamicsSection(props: CharacterDynamicsSectionProps) {
  const { novelId, selectedCharacter, selectedCharacterId, onSelectedCharacterChange } = props;
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<DynamicsView>("overview");
  const [manualState, setManualState] = useState({
    currentState: "",
    currentGoal: "",
    factionLabel: "",
    stanceLabel: "",
    summary: "",
  });

  useEffect(() => {
    setManualState({
      currentState: selectedCharacter?.currentState ?? "",
      currentGoal: selectedCharacter?.currentGoal ?? "",
      factionLabel: "",
      stanceLabel: "",
      summary: "",
    });
  }, [selectedCharacter?.id, selectedCharacter?.currentGoal, selectedCharacter?.currentState]);

  const overviewQuery = useQuery({
    queryKey: queryKeys.novels.characterDynamicsOverview(novelId),
    queryFn: () => getCharacterDynamicsOverview(novelId),
    enabled: Boolean(novelId),
  });

  const candidatesQuery = useQuery({
    queryKey: queryKeys.novels.characterCandidates(novelId),
    queryFn: () => getCharacterCandidates(novelId),
    enabled: Boolean(novelId),
  });

  const overview = overviewQuery.data?.data ?? null;
  const candidates = candidatesQuery.data?.data ?? [];
  const pendingCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.status === "pending"),
    [candidates],
  );
  const assignmentsByCharacterId = useMemo(
    () => new Map((overview?.assignments ?? []).map((assignment) => [assignment.characterId, assignment])),
    [overview?.assignments],
  );
  const selectedOverviewCharacter = useMemo(
    () => overview?.characters.find((item) => item.characterId === selectedCharacterId) ?? null,
    [overview?.characters, selectedCharacterId],
  );

  const invalidateDynamics = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterRelations(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterDynamicsOverview(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCandidates(novelId) }),
    ]);
  };

  const rebuildMutation = useMutation({
    mutationFn: () => rebuildCharacterDynamics(novelId),
    onSuccess: async () => {
      await invalidateDynamics();
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (candidateId: string) => confirmCharacterCandidate(novelId, candidateId),
    onSuccess: async (response) => {
      const characterId = response.data?.characterId ?? "";
      if (characterId) {
        onSelectedCharacterChange(characterId);
      }
      await invalidateDynamics();
    },
  });

  const mergeMutation = useMutation({
    mutationFn: (candidateId: string) => mergeCharacterCandidate(novelId, candidateId, {
      characterId: selectedCharacterId,
    }),
    onSuccess: async () => {
      await invalidateDynamics();
    },
  });

  const manualStateMutation = useMutation({
    mutationFn: () => {
      if (!selectedCharacterId) {
        throw new Error("请先选择一个角色。");
      }
      return updateCharacterDynamicState(novelId, selectedCharacterId, {
        currentState: manualState.currentState.trim() || undefined,
        currentGoal: manualState.currentGoal.trim() || undefined,
        factionLabel: manualState.factionLabel.trim() || undefined,
        stanceLabel: manualState.stanceLabel.trim() || undefined,
        summary: manualState.summary.trim() || undefined,
        decisionNote: manualState.summary.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await invalidateDynamics();
    },
  });

  return (
    <Card className="border-border/70">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <CardTitle>动态角色系统</CardTitle>
            <div className="text-sm text-muted-foreground">
              这里把卷级职责、缺席风险、新角色候选和关系阶段放回角色页主流程，不再依赖你自己手工追踪。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{overview?.currentVolume?.title ?? "未定位当前卷"}</Badge>
            <Badge variant="outline">{overview?.pendingCandidateCount ?? pendingCandidates.length} 个待确认候选</Badge>
            <AiButton
              variant="outline"
              size="sm"
              onClick={() => rebuildMutation.mutate()}
              disabled={rebuildMutation.isPending}
            >
              {rebuildMutation.isPending ? "重建中..." : "重建动态角色"}
            </AiButton>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["overview", "candidates", "relations", "duties"] as DynamicsView[]).map((view) => (
            <Button
              key={view}
              type="button"
              size="sm"
              variant={activeView === view ? "default" : "outline"}
              onClick={() => setActiveView(view)}
            >
              {{
                overview: "动态总览",
                candidates: "新角色候选",
                relations: "关系阶段",
                duties: "卷级职责与缺席风险",
              }[view]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {overviewQuery.isLoading ? (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
            正在加载动态角色系统...
          </div>
        ) : null}

        {activeView === "overview" && overview ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
              {overview.summary}
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {overview.characters.map((item) => (
                <button
                  key={item.characterId}
                  type="button"
                  onClick={() => onSelectedCharacterChange(item.characterId)}
                  className="rounded-2xl border border-border/70 p-4 text-left transition hover:border-primary/40 hover:bg-muted/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.role}</div>
                    </div>
                    <Badge className={riskTone(item.absenceRisk)} variant="outline">
                      {item.absenceRisk === "none" ? "稳定" : `风险 ${item.absenceRisk}`}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <div>卷级职责：{item.volumeResponsibility ?? "尚未分配"}</div>
                    <div>计划出场章：{item.plannedChapterOrders.join("、") || "未定义"}</div>
                    <div>最近出场：{item.lastAppearanceChapterOrder ?? "暂无"} / 出场次数：{item.appearanceCount}</div>
                    {item.factionLabel ? <div>阵营：{item.factionLabel}{item.stanceLabel ? ` | 立场：${item.stanceLabel}` : ""}</div> : null}
                  </div>
                </button>
              ))}
            </div>

            {selectedCharacter ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="mb-3 text-sm font-medium">手动修正当前角色动态状态</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="当前状态"
                    value={manualState.currentState}
                    onChange={(event) => setManualState((prev) => ({ ...prev, currentState: event.target.value }))}
                  />
                  <Input
                    placeholder="当前目标"
                    value={manualState.currentGoal}
                    onChange={(event) => setManualState((prev) => ({ ...prev, currentGoal: event.target.value }))}
                  />
                  <Input
                    placeholder="阵营/站队"
                    value={manualState.factionLabel}
                    onChange={(event) => setManualState((prev) => ({ ...prev, factionLabel: event.target.value }))}
                  />
                  <Input
                    placeholder="立场说明"
                    value={manualState.stanceLabel}
                    onChange={(event) => setManualState((prev) => ({ ...prev, stanceLabel: event.target.value }))}
                  />
                </div>
                <textarea
                  className="mt-3 min-h-[88px] w-full rounded-xl border bg-background p-3 text-sm"
                  placeholder="补充这次变化的原因、后续作用或提醒 planner 的重点。"
                  value={manualState.summary}
                  onChange={(event) => setManualState((prev) => ({ ...prev, summary: event.target.value }))}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() => manualStateMutation.mutate()}
                    disabled={manualStateMutation.isPending || !selectedCharacterId}
                  >
                    {manualStateMutation.isPending ? "保存中..." : "保存动态状态"}
                  </Button>
                  {selectedOverviewCharacter?.volumeResponsibility ? (
                    <Badge variant="outline">当前卷职责：{selectedOverviewCharacter.volumeResponsibility}</Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeView === "candidates" ? (
          pendingCandidates.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {pendingCandidates.map((candidate) => (
                <div key={candidate.id} className="rounded-2xl border border-border/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{candidate.proposedName}</div>
                      <div className="text-xs text-muted-foreground">
                        {candidate.proposedRole || "未标注角色定位"}{typeof candidate.sourceChapterOrder === "number" ? ` | 来源第 ${candidate.sourceChapterOrder} 章` : ""}
                      </div>
                    </div>
                    <Badge variant="outline">{typeof candidate.confidence === "number" ? `置信度 ${Math.round(candidate.confidence * 100)}%` : "待确认"}</Badge>
                  </div>
                  {candidate.summary ? <div className="mt-3 text-sm text-muted-foreground">{candidate.summary}</div> : null}
                  {candidate.evidence.length > 0 ? (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {candidate.evidence.map((evidence, index) => (
                        <div key={`${candidate.id}-${index}`}>证据：{evidence}</div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => confirmMutation.mutate(candidate.id)}
                      disabled={confirmMutation.isPending}
                    >
                      {confirmMutation.isPending ? "确认中..." : "确认成新角色"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => mergeMutation.mutate(candidate.id)}
                      disabled={mergeMutation.isPending || !selectedCharacterId}
                    >
                      {mergeMutation.isPending ? "合并中..." : selectedCharacterId ? `并入当前焦点` : "先选一个已存在角色"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              还没有待确认的新角色候选。写完几章后，这里会自动汇总 AI 抽取到的新人物入口。
            </div>
          )
        ) : null}

        {activeView === "relations" ? (
          overview?.relations?.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {overview.relations.map((relation) => (
                <div key={relation.id} className="rounded-2xl border border-border/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{relation.sourceCharacterName}{" -> "}{relation.targetCharacterName}</div>
                    <Badge variant="outline">{relation.stageLabel}</Badge>
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">{relation.stageSummary}</div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {relation.volumeTitle ? <div>卷：{relation.volumeTitle}</div> : null}
                    {typeof relation.chapterOrder === "number" ? <div>最近推进章：第 {relation.chapterOrder} 章</div> : null}
                    {relation.nextTurnPoint ? <div>下一阶段触发点：{relation.nextTurnPoint}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              当前还没有关系阶段数据。应用阵容或完成章节后，这里会自动出现。
            </div>
          )
        ) : null}

        {activeView === "duties" ? (
          overview?.characters?.length ? (
            <div className="space-y-3">
              {overview.characters.map((item) => {
                const assignment = assignmentsByCharacterId.get(item.characterId);
                return (
                  <div key={item.characterId} className="rounded-2xl border border-border/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{assignment?.roleLabel || item.role}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {assignment?.isCore ? <Badge variant="secondary">本卷核心</Badge> : null}
                        <Badge className={riskTone(item.absenceRisk)} variant="outline">
                          {item.absenceRisk === "none" ? "无缺席风险" : `缺席 ${item.absenceSpan} 章`}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
                      <div>职责：{assignment?.responsibility ?? "未分配"}</div>
                      <div>预计出场：{assignment?.appearanceExpectation ?? "未定义"}</div>
                      <div>计划章：{assignment?.plannedChapterOrders.join("、") || "未定义"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
              当前卷还没有角色职责投影。点击上方“重建动态角色”即可初始化。
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
