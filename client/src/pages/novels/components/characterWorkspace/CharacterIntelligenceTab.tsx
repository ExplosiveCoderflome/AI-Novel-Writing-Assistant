import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@ai-novel/shared/types/novel";
import { Brain, RefreshCw } from "lucide-react";
import {
  activateLatestCharacterDialogueInfluence,
  createCharacterDialogueSession,
  dismissLatestCharacterDialogueInfluence,
  getActiveCharacterDialogueSession,
  getCharacterMindState,
  refreshCharacterMindState,
  sendCharacterDialogueTurn,
} from "@/api/novelCharacterDynamics";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import FullscreenView from "@/components/common/FullscreenView";
import { Badge } from "@/components/ui/badge";
import CharacterDialogueStage from "./CharacterDialogueStage";
import CharacterMindSceneAnalysis from "./CharacterMindSceneAnalysis";

interface CharacterIntelligenceTabProps {
  novelId: string;
  selectedCharacter: Character;
}

export default function CharacterIntelligenceTab(props: CharacterIntelligenceTabProps) {
  const { novelId, selectedCharacter } = props;
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const mindQueryKey = queryKeys.novels.characterMindState(novelId, selectedCharacter.id);
  const dialogueQueryKey = queryKeys.novels.characterDialogueSession(novelId, selectedCharacter.id);
  const mindQuery = useQuery({
    queryKey: mindQueryKey,
    queryFn: () => getCharacterMindState(novelId, selectedCharacter.id),
    enabled: Boolean(novelId && selectedCharacter.id),
  });
  const refreshMutation = useMutation({
    mutationFn: () => refreshCharacterMindState(novelId, selectedCharacter.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mindQueryKey }),
  });
  const mind = mindQuery.data?.data ?? null;
  const dialogueQuery = useQuery({
    queryKey: dialogueQueryKey,
    queryFn: () => getActiveCharacterDialogueSession(novelId, selectedCharacter.id),
    enabled: Boolean(novelId && selectedCharacter.id && mind),
  });
  const invalidateDialogue = () => queryClient.invalidateQueries({ queryKey: dialogueQueryKey });
  const createDialogueMutation = useMutation({ mutationFn: () => createCharacterDialogueSession(novelId, selectedCharacter.id), onSuccess: invalidateDialogue });
  const sendTurnMutation = useMutation({
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) => sendCharacterDialogueTurn(novelId, selectedCharacter.id, sessionId, { message: content }),
    onSuccess: () => { setMessage(""); invalidateDialogue(); },
  });
  const activateInfluenceMutation = useMutation({ mutationFn: (sessionId: string) => activateLatestCharacterDialogueInfluence(novelId, selectedCharacter.id, sessionId), onSuccess: invalidateDialogue });
  const dismissInfluenceMutation = useMutation({ mutationFn: (sessionId: string) => dismissLatestCharacterDialogueInfluence(novelId, selectedCharacter.id, sessionId), onSuccess: invalidateDialogue });

  if (mindQuery.isLoading) return <section className="rounded-3xl border border-dashed p-6 text-sm text-muted-foreground">正在整理角色的谈话场景...</section>;
  if (!mind) return <EmptyMindState characterName={selectedCharacter.name} isRefreshing={refreshMutation.isPending} error={refreshMutation.error} onRefresh={() => refreshMutation.mutate()} />;

  return (
    <FullscreenView
      title={<span className="inline-flex items-center gap-2"><Brain className="h-4 w-4 text-primary" />{selectedCharacter.name} 的对话空间</span>}
      description="先和角色谈谈，再决定这段交流是否带入后续创作。"
      meta={<><Badge variant="outline">角色对话</Badge><Badge variant="secondary">场景分析已就绪</Badge></>}
      actions={<AiButton variant="outline" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{refreshMutation.isPending ? "整理中..." : "更新场景分析"}</AiButton>}
      toggleLabel="全屏对话"
      exitLabel="退出全屏"
      bodyClassName="grid min-h-[580px] min-w-0 xl:grid-cols-[minmax(0,1fr)_340px]"
      fullscreenBodyClassName="min-h-0 min-w-0 overflow-y-auto xl:h-full xl:overflow-hidden xl:grid-cols-[minmax(0,1fr)_380px]"
    >
      <div className="min-h-0 min-w-0 border-b border-border/60 bg-muted/[0.08] p-4 xl:border-b-0 xl:border-r xl:p-6">
        <CharacterDialogueStage
          className="xl:h-full xl:min-h-0 xl:max-h-none"
          characterName={selectedCharacter.name}
          session={dialogueQuery.data?.data ?? null}
          isLoading={dialogueQuery.isLoading}
          isCreating={createDialogueMutation.isPending}
          isSending={sendTurnMutation.isPending}
          isActivating={activateInfluenceMutation.isPending}
          isDismissing={dismissInfluenceMutation.isPending}
          message={message}
          onMessageChange={setMessage}
          onCreate={() => createDialogueMutation.mutate()}
          onSend={(sessionId) => sendTurnMutation.mutate({ sessionId, content: message.trim() })}
          onActivate={(sessionId) => activateInfluenceMutation.mutate(sessionId)}
          onDismiss={(sessionId) => dismissInfluenceMutation.mutate(sessionId)}
          error={createDialogueMutation.error ?? sendTurnMutation.error ?? activateInfluenceMutation.error ?? dismissInfluenceMutation.error ?? dialogueQuery.error}
        />
      </div>
      <div className="min-h-0 min-w-0 bg-muted/[0.12] p-4 xl:overflow-y-auto xl:p-6">
        <CharacterMindSceneAnalysis className="xl:static" characterName={selectedCharacter.name} mind={mind} />
        {refreshMutation.error ? <div className="mt-3 text-sm text-destructive">{refreshMutation.error instanceof Error ? refreshMutation.error.message : "场景分析暂时无法更新，请稍后重试。"}</div> : null}
      </div>
    </FullscreenView>
  );
}

function EmptyMindState(props: { characterName: string; isRefreshing: boolean; error: unknown; onRefresh: () => void }) {
  return <section className="rounded-3xl border border-dashed bg-muted/10 p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold"><Brain className="h-4 w-4" />准备谈话场景</div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">AI 会结合角色档案、关系、已发生剧情和当前处境，整理这次谈话需要理解的角色视角。</p></div><AiButton onClick={props.onRefresh} disabled={props.isRefreshing}>{props.isRefreshing ? "整理中..." : "让 AI 整理谈话场景"}</AiButton></div>{props.error ? <div className="mt-3 text-sm text-destructive">{props.error instanceof Error ? props.error.message : "场景整理暂时无法完成，请稍后重试。"}</div> : null}</section>;
}
