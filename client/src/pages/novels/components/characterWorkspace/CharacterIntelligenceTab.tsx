import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@ai-novel/shared/types/novel";
import type { CharacterInfluenceProposal, CharacterInfluenceProposalStatus } from "@ai-novel/shared/types/characterInfluence";
import { Brain, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import {
  acceptCharacterInfluenceProposal,
  dismissCharacterInfluenceProposal,
  generateCharacterInfluenceProposals,
  getCharacterInfluenceProposals,
  getCharacterMindState,
  refreshCharacterMindState,
} from "@/api/novelCharacterDynamics";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CharacterIntelligenceTabProps {
  novelId: string;
  selectedCharacter: Character;
}

export default function CharacterIntelligenceTab(props: CharacterIntelligenceTabProps) {
  const { novelId, selectedCharacter } = props;
  const queryClient = useQueryClient();
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [authorIntent, setAuthorIntent] = useState("");
  const queryKey = queryKeys.novels.characterMindState(novelId, selectedCharacter.id);
  const influenceQueryKey = queryKeys.novels.characterInfluenceProposals(novelId, selectedCharacter.id);
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
  const influenceQuery = useQuery({
    queryKey: influenceQueryKey,
    queryFn: () => getCharacterInfluenceProposals(novelId, selectedCharacter.id),
    enabled: Boolean(novelId && selectedCharacter.id && mind),
  });
  const invalidateInfluence = () => queryClient.invalidateQueries({ queryKey: influenceQueryKey });
  const generateInfluenceMutation = useMutation({
    mutationFn: () => generateCharacterInfluenceProposals(novelId, selectedCharacter.id),
    onSuccess: invalidateInfluence,
  });
  const acceptInfluenceMutation = useMutation({
    mutationFn: ({ proposalId, intent }: { proposalId: string; intent?: string }) =>
      acceptCharacterInfluenceProposal(novelId, selectedCharacter.id, proposalId, intent ? { authorIntent: intent } : undefined),
    onSuccess: () => {
      setSelectedProposalId(null);
      setAuthorIntent("");
      invalidateInfluence();
    },
  });
  const dismissInfluenceMutation = useMutation({
    mutationFn: (proposalId: string) => dismissCharacterInfluenceProposal(novelId, selectedCharacter.id, proposalId),
    onSuccess: () => {
      setSelectedProposalId(null);
      setAuthorIntent("");
      invalidateInfluence();
    },
  });
  const proposals = influenceQuery.data?.data ?? [];

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
      <CharacterInfluenceWorkspace
        characterName={selectedCharacter.name}
        proposals={proposals}
        isLoading={influenceQuery.isLoading}
        isGenerating={generateInfluenceMutation.isPending}
        isAccepting={acceptInfluenceMutation.isPending}
        isDismissing={dismissInfluenceMutation.isPending}
        selectedProposalId={selectedProposalId}
        authorIntent={authorIntent}
        onGenerate={() => generateInfluenceMutation.mutate()}
        onSelect={(proposalId) => {
          setSelectedProposalId(proposalId);
          setAuthorIntent("");
        }}
        onCloseSelection={() => {
          setSelectedProposalId(null);
          setAuthorIntent("");
        }}
        onIntentChange={setAuthorIntent}
        onAccept={(proposalId) => acceptInfluenceMutation.mutate({ proposalId, intent: authorIntent.trim() || undefined })}
        onDismiss={(proposalId) => dismissInfluenceMutation.mutate(proposalId)}
        error={generateInfluenceMutation.error ?? acceptInfluenceMutation.error ?? dismissInfluenceMutation.error ?? influenceQuery.error}
      />
      {refreshMutation.error ? <div className="text-sm text-destructive">{refreshMutation.error instanceof Error ? refreshMutation.error.message : "刷新失败，请稍后重试。"}</div> : null}
    </div>
  );
}

function CharacterInfluenceWorkspace(props: {
  characterName: string;
  proposals: CharacterInfluenceProposal[];
  isLoading: boolean;
  isGenerating: boolean;
  isAccepting: boolean;
  isDismissing: boolean;
  selectedProposalId: string | null;
  authorIntent: string;
  error: unknown;
  onGenerate: () => void;
  onSelect: (proposalId: string) => void;
  onCloseSelection: () => void;
  onIntentChange: (value: string) => void;
  onAccept: (proposalId: string) => void;
  onDismiss: (proposalId: string) => void;
}) {
  const hasDraft = props.proposals.some((proposal) => proposal.status === "draft");
  const canGenerate = !props.isGenerating && !hasDraft;

  return (
    <section className="rounded-2xl border border-border/70 bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4" />为他准备下一步</div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">AI 会基于当前思路线整理可选方向。确认后，它只会作为后续章节的软性行为引导，不会自动改写小说正史。</p>
        </div>
        <AiButton variant="outline" size="sm" onClick={props.onGenerate} disabled={!canGenerate}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />{props.isGenerating ? "准备中..." : hasDraft ? "先处理候选方案" : "让 AI 准备方向"}
        </AiButton>
      </div>

      {props.isLoading ? <div className="mt-4 text-sm text-muted-foreground">正在读取可选方向...</div> : null}
      {!props.isLoading && props.proposals.length === 0 ? <div className="mt-4 rounded-xl border border-dashed bg-background/60 p-4 text-sm leading-6 text-muted-foreground">还没有为“{props.characterName}”准备下一步方向。你可以让 AI 根据当前剧情给出 2–3 个可选倾向。</div> : null}
      {props.proposals.length ? <div className="mt-4 space-y-3">{props.proposals.map((proposal) => (
        <InfluenceProposalCard
          key={proposal.id}
          proposal={proposal}
          selected={props.selectedProposalId === proposal.id}
          authorIntent={props.authorIntent}
          isAccepting={props.isAccepting}
          isDismissing={props.isDismissing}
          onSelect={() => props.onSelect(proposal.id)}
          onCloseSelection={props.onCloseSelection}
          onIntentChange={props.onIntentChange}
          onAccept={() => props.onAccept(proposal.id)}
          onDismiss={() => props.onDismiss(proposal.id)}
        />
      ))}</div> : null}
      {props.error ? <div className="mt-3 text-sm text-destructive">{props.error instanceof Error ? props.error.message : "暂时无法处理这个方向，请稍后重试。"}</div> : null}
    </section>
  );
}

function InfluenceProposalCard(props: {
  proposal: CharacterInfluenceProposal;
  selected: boolean;
  authorIntent: string;
  isAccepting: boolean;
  isDismissing: boolean;
  onSelect: () => void;
  onCloseSelection: () => void;
  onIntentChange: (value: string) => void;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { proposal } = props;
  const canDismiss = proposal.status === "draft" || proposal.status === "accepted";
  const canAccept = proposal.status === "draft";
  return (
    <article className="rounded-xl border border-border/70 bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2"><div className="text-sm font-medium">{proposal.title}</div>{proposal.isRecommended ? <Badge>推荐</Badge> : null}</div>
        <Badge variant="outline">{influenceStatusLabel(proposal.status)}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6">{proposal.directionSummary}</p>
      <div className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
        <ProposalField title="为什么推荐" value={proposal.recommendationReason} />
        <ProposalField title="读者会获得什么" value={proposal.readerPayoff} />
        <ProposalField title="需要留意什么" value={proposal.risk} />
        <ProposalField title="适用章节" value={`第 ${proposal.targetStartChapterOrder}–${proposal.targetEndChapterOrder} 章`} />
      </div>
      {proposal.resolutionEvidence.length ? <ProposalField title="正文承接依据" value={proposal.resolutionEvidence.join("；")} className="mt-3" /> : null}
      {canAccept ? (
        <div className="mt-4">
          {props.selected ? (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <label className="block text-sm font-medium" htmlFor={`author-intent-${proposal.id}`}>补充一句创作意图（可选）</label>
              <textarea
                id={`author-intent-${proposal.id}`}
                value={props.authorIntent}
                maxLength={160}
                rows={2}
                onChange={(event) => props.onIntentChange(event.target.value)}
                placeholder="例如：希望他先克制试探，再在关键节点作出选择"
                className="w-full resize-none rounded-md border bg-background p-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>AI 会把这句话整理为后续章节的软性引导。</span><span>{props.authorIntent.length}/160</span></div>
              <div className="flex flex-wrap gap-2"><AiButton size="sm" onClick={props.onAccept} disabled={props.isAccepting}>{props.isAccepting ? "确认中..." : "确认这个方向"}</AiButton><Button size="sm" variant="ghost" onClick={props.onCloseSelection}>收起</Button></div>
            </div>
          ) : <AiButton size="sm" onClick={props.onSelect}>选择这个方向</AiButton>}
        </div>
      ) : null}
      {canDismiss ? <Button className="mt-3" size="sm" variant="ghost" onClick={props.onDismiss} disabled={props.isDismissing}>{props.isDismissing ? "处理中..." : "放弃这个方向"}</Button> : null}
    </article>
  );
}

function ProposalField(props: { title: string; value: string; className?: string }) {
  return <div className={props.className}><div className="text-xs font-medium text-muted-foreground">{props.title}</div><div className="mt-1 leading-6">{props.value}</div></div>;
}

function influenceStatusLabel(status: CharacterInfluenceProposalStatus) {
  const labels: Record<CharacterInfluenceProposalStatus, string> = {
    draft: "待选择",
    accepted: "等待承接",
    applied: "已在正文承接",
    expired: "已过适用章节",
    superseded: "已被新方向替换",
    dismissed: "已放弃",
  };
  return labels[status];
}

function MindPanel(props: { title: string; value?: string | null }) {
  return <section className="rounded-2xl border border-border/70 bg-background p-4"><div className="text-xs font-medium text-muted-foreground">{props.title}</div><div className="mt-2 min-h-12 text-sm leading-6">{props.value || "AI 暂未判断出稳定倾向。"}</div></section>;
}

function ListPanel(props: { title: string; items: string[]; empty: string }) {
  return <section className="rounded-2xl border border-border/70 bg-background p-4"><div className="text-sm font-medium">{props.title}</div><div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">{props.items.length ? props.items.map((item, index) => <div key={`${props.title}-${index}`}>• {item}</div>) : props.empty}</div></section>;
}
