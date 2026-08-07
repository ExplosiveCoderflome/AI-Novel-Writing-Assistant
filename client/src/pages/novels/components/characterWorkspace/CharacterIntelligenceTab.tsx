import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@ai-novel/shared/types/novel";
import { Brain, RefreshCw } from "lucide-react";
import { getCharacterMindState, refreshCharacterMindState } from "@/api/novelCharacterDynamics";
import { queryKeys } from "@/api/queryKeys";
import CharacterConversationWorkbench from "@/components/characterConversation/CharacterConversationWorkbench";
import AiButton from "@/components/common/AiButton";
import CharacterMindSceneAnalysis from "./CharacterMindSceneAnalysis";

interface CharacterIntelligenceTabProps {
  novelId: string;
  selectedCharacter: Character;
}

export default function CharacterIntelligenceTab(props: CharacterIntelligenceTabProps) {
  const { novelId, selectedCharacter } = props;
  const queryClient = useQueryClient();
  const mindQueryKey = queryKeys.novels.characterMindState(novelId, selectedCharacter.id);
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

  if (mindQuery.isLoading) return <section className="rounded-3xl border border-dashed p-6 text-sm text-muted-foreground">Collating character conversation scenes...</section>;
  if (!mind) return <EmptyMindState characterName={selectedCharacter.name} isRefreshing={refreshMutation.isPending} error={refreshMutation.error} onRefresh={() => refreshMutation.mutate()} />;

  return (
    <CharacterConversationWorkbench
      subject={{ kind: "novel_character", id: selectedCharacter.id, scopeKind: "novel", scopeId: novelId }}
      characterName={selectedCharacter.name}
      headerActions={<AiButton variant="outline" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{refreshMutation.isPending ? "In progress..." : "Update scene analysis"}</AiButton>}
      sidePanel={<><CharacterMindSceneAnalysis characterName={selectedCharacter.name} mind={mind} />{refreshMutation.error ? <div className="mt-3 text-sm text-destructive">{refreshMutation.error instanceof Error ? refreshMutation.error.message : "Scene analysis cannot be updated temporarily, please try again later."}</div> : null}</>}
    />
  );
}

function EmptyMindState(props: { characterName: string; isRefreshing: boolean; error: unknown; onRefresh: () => void }) {
  return <section className="rounded-3xl border border-dashed bg-muted/10 p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold"><Brain className="h-4 w-4" />Prepare the conversation scene</div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">AI will combine the character profile, relationships, plots that have occurred, and the current situation to sort out the character perspective that needs to be understood for this conversation.</p></div><AiButton onClick={props.onRefresh} disabled={props.isRefreshing}>{props.isRefreshing ? "Organizing..." : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}</AiButton></div>{props.error ? <div className="mt-3 text-sm text-destructive">{props.error instanceof Error ? props.error.message : "Scene organization cannot be completed temporarily, please try again later."}</div> : null}</section>;
}
