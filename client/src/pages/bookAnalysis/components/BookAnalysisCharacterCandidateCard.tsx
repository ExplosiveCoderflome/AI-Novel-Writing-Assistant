import type {
  BookAnalysisCharacter,
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerationDepth,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface BookAnalysisCharacterCandidateCardProps {
  character: BookAnalysisCharacter;
  disabled: boolean;
  isGenerating: boolean;
  generationDepth: BookAnalysisCharacterGenerationDepth;
  selectedDimensions: BookAnalysisCharacterDimension[];
  onGenerate: (
    characterId: string,
    input: {
      generationDepth: BookAnalysisCharacterGenerationDepth;
      selectedDimensions: BookAnalysisCharacterDimension[];
    },
  ) => Promise<void>;
  onDelete: (characterId: string) => Promise<void>;
}

export default function BookAnalysisCharacterCandidateCard(props: BookAnalysisCharacterCandidateCardProps) {
  const {
    character,
    disabled,
    isGenerating,
    generationDepth,
    selectedDimensions,
    onGenerate,
    onDelete,
  } = props;
  const generating = isGenerating || character.status === "generating";
  const failed = character.status === "failed";

  return (
    <div className="rounded-md border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">{character.name}</div>
            <Badge variant={failed ? "destructive" : "outline"}>
              {generating ? "生成中" : failed ? "生成失败" : "候选"}
            </Badge>
            {character.importance ? <Badge variant="secondary">{character.importance}</Badge> : null}
          </div>
          <div className="text-muted-foreground">{character.role}</div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => void onGenerate(character.id, { generationDepth, selectedDimensions })}
            disabled={disabled || generating || selectedDimensions.length === 0}
          >
            {generating ? "生成中..." : failed ? "重试生成" : "生成档案"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void onDelete(character.id)}
            disabled={disabled || generating}
          >
            删除
          </Button>
        </div>
      </div>
      {character.briefDescription ? (
        <div className="mt-2 leading-6 text-muted-foreground">{character.briefDescription}</div>
      ) : null}
      {character.occurringChapters && character.occurringChapters.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {character.occurringChapters.slice(0, 6).map((chapter) => (
            <Badge key={chapter} variant="outline" className="text-[11px]">
              {chapter}
            </Badge>
          ))}
        </div>
      ) : null}
      {failed && character.lastGenerationError ? (
        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {character.lastGenerationError}
        </div>
      ) : null}
    </div>
  );
}
