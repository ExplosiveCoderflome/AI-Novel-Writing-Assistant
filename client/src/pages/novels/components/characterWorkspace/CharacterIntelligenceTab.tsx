import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@ai-novel/shared/types/novel";
import { Brain, RefreshCw, ShieldCheck } from "lucide-react";
import { getCharacterMindState, refreshCharacterMindState } from "@/api/novelCharacterDynamics";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";

interface CharacterIntelligenceTabProps {
  novelId: string;
  selectedCharacter: Character;
}

export default function CharacterIntelligenceTab(props: CharacterIntelligenceTabProps) {
  const { novelId, selectedCharacter } = props;
  const queryClient = useQueryClient();
  const queryKey = queryKeys.novels.characterMindState(novelId, selectedCharacter.id);
  const mindQuery = useQuery({
    queryKey,
    queryFn: () => getCharacterMindState(novelId, selectedCharacter.id),
    enabled: Boolean(novelId && selectedCharacter.id),
  });
  const refreshMutation = useMutation({
    mutationFn: () => refreshCharacterMindState(novelId, selectedCharacter.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const mind = mindQuery.data?.data ?? null;

  if (mindQuery.isLoading) {
    return <section className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">正在整理角色当前的想法与行动倾向...</section>;
  }

  if (!mind) {
    return (
      <section className="rounded-2xl border border-dashed bg-muted/10 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium"><Brain className="h-4 w-4" />理解当前角色</div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              AI 会结合角色档案、关系、已发生剧情和当前处境，整理“{selectedCharacter.name}”现在如何理解局面、想做什么以及可能的误判。
            </p>
          </div>
          <AiButton onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            {refreshMutation.isPending ? "整理中..." : "让 AI 整理当前想法"}
          </AiButton>
        </div>
        {refreshMutation.error ? <div className="mt-3 text-sm text-destructive">{refreshMutation.error instanceof Error ? refreshMutation.error.message : "整理失败，请稍后重试。"}</div> : null}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/70 bg-muted/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium"><Brain className="h-4 w-4" />角色思路线</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">这是 AI 基于已知剧情作出的角色主观推断，不会自动改写小说正史。</p>
          </div>
          <AiButton variant="outline" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />{refreshMutation.isPending ? "刷新中..." : "刷新当前理解"}
          </AiButton>
        </div>
        <div className="mt-4 text-sm leading-7">{mind.currentInterpretation}</div>
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <MindPanel title="想做什么" value={mind.activePlan || mind.privateIntent} />
        <MindPanel title="受压时会怎样行动" value={mind.actionTendency} />
        <MindPanel title="当前情绪与立场" value={mind.emotionalStance} />
        <MindPanel title="什么会改变决定" value={mind.decisionTrigger} />
      </div>

      <section className="grid gap-3 xl:grid-cols-2">
        <ListPanel title="当前相信" items={mind.beliefs} empty="暂无需要特别追踪的判断。" />
        <ListPanel title="可能误判" items={mind.misbeliefs} empty="暂无明确误判。" />
      </section>

      <section className="rounded-2xl border border-border/70 bg-background p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" />推断依据</div>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          {mind.evidence.map((item, index) => <div key={`${mind.id}-${index}`}>• {item}</div>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">来源：{mind.sourceType === "artifact_delta" ? "章节定稿后的变化" : mind.sourceType === "bootstrap" ? "角色准备" : "手动刷新"}</Badge>
          {mind.sourceChapterOrder != null ? <Badge variant="outline">来源：第 {mind.sourceChapterOrder} 章{mind.sourceChapterTitle ? `《${mind.sourceChapterTitle}》` : ""}</Badge> : null}
          {typeof mind.confidence === "number" ? <Badge variant="outline">置信度 {Math.round(mind.confidence * 100)}%</Badge> : null}
        </div>
      </section>
      {refreshMutation.error ? <div className="text-sm text-destructive">{refreshMutation.error instanceof Error ? refreshMutation.error.message : "刷新失败，请稍后重试。"}</div> : null}
    </div>
  );
}

function MindPanel(props: { title: string; value?: string | null }) {
  return <section className="rounded-2xl border border-border/70 bg-background p-4"><div className="text-xs font-medium text-muted-foreground">{props.title}</div><div className="mt-2 min-h-12 text-sm leading-6">{props.value || "AI 暂未判断出稳定倾向。"}</div></section>;
}

function ListPanel(props: { title: string; items: string[]; empty: string }) {
  return <section className="rounded-2xl border border-border/70 bg-background p-4"><div className="text-sm font-medium">{props.title}</div><div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">{props.items.length ? props.items.map((item, index) => <div key={`${props.title}-${index}`}>• {item}</div>) : props.empty}</div></section>;
}
