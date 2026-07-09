import type { Character } from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import CharacterDiagnosticsSection from "../CharacterDiagnosticsSection";

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

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border/70 bg-muted/10 p-4">
        <div className="text-sm font-medium">关系与阵容诊断</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">
          用来检查角色功能、关系缺口和动态关系。日常编辑可以停留在总览、档案、资源或时间线。
        </div>
      </section>
      <CharacterDiagnosticsSection
        novelId={novelId}
        characters={characters}
        selectedCharacter={selectedCharacter}
        selectedCharacterId={selectedCharacterId}
        onSelectedCharacterChange={onSelectedCharacterChange}
        llmProvider={llmProvider}
        llmModel={llmModel}
        defaultOpen
      />
    </div>
  );
}
