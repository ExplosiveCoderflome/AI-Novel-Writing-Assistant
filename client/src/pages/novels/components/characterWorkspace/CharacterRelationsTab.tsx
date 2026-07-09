import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Character } from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { getCharacterRelations } from "@/api/novel";
import { getCharacterDynamicsOverview } from "@/api/novelCharacterDynamics";
import { queryKeys } from "@/api/queryKeys";
import CharacterDiagnosticsSection from "../CharacterDiagnosticsSection";
import CharacterRelationshipGraphPanel from "./CharacterRelationshipGraphPanel";
import {
  buildRelationshipGraphModel,
  type RelationshipGraphMode,
} from "./characterRelationshipGraphModel";

interface CharacterRelationsTabProps {
  novelId: string;
  characters: Character[];
  selectedCharacter?: Character;
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
  llmProvider?: LLMProvider;
  llmModel?: string;
}

export default function CharacterRelationsTab(props: CharacterRelationsTabProps) {
  const {
    novelId,
    characters,
    selectedCharacter,
    selectedCharacterId,
    onSelectedCharacterChange,
    llmProvider,
    llmModel,
  } = props;
  const [graphMode, setGraphMode] = useState<RelationshipGraphMode>("all");

  const relationsQuery = useQuery({
    queryKey: queryKeys.novels.characterRelations(novelId),
    queryFn: () => getCharacterRelations(novelId),
    enabled: Boolean(novelId),
  });

  const dynamicsQuery = useQuery({
    queryKey: queryKeys.novels.characterDynamicsOverview(novelId),
    queryFn: () => getCharacterDynamicsOverview(novelId),
    enabled: Boolean(novelId),
  });

  const graphModel = useMemo(
    () => buildRelationshipGraphModel({
      characters,
      staticRelations: relationsQuery.data?.data ?? [],
      dynamicRelations: dynamicsQuery.data?.data?.relations ?? [],
      selectedCharacterId,
      mode: graphMode,
    }),
    [characters, dynamicsQuery.data?.data?.relations, graphMode, relationsQuery.data?.data, selectedCharacterId],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/70 bg-muted/10 p-4">
        <div className="text-sm font-medium">关系导演台</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">
          先用关系网观察角色之间的合作、压力、秘密和阶段变化；需要补位或重建动态系统时，再展开下方诊断区。
        </div>
      </section>

      <CharacterRelationshipGraphPanel
        model={graphModel}
        mode={graphMode}
        onModeChange={setGraphMode}
        selectedCharacterId={selectedCharacterId}
        onSelectedCharacterChange={onSelectedCharacterChange}
        isLoading={relationsQuery.isLoading || dynamicsQuery.isLoading}
      />

      <CharacterDiagnosticsSection
        novelId={novelId}
        characters={characters}
        selectedCharacter={selectedCharacter}
        selectedCharacterId={selectedCharacterId}
        onSelectedCharacterChange={onSelectedCharacterChange}
        llmProvider={llmProvider}
        llmModel={llmModel}
        defaultOpen={false}
      />
    </div>
  );
}
