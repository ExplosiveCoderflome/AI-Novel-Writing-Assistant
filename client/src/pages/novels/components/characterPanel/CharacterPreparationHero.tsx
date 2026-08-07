import type { Character } from "@ai-novel/shared/types/novel";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";
import { StatusRail, StepActionBar, StepHero } from "../workspaceShell";

interface CharacterPreparationHeroProps {
  characters: Character[];
  coreCharacterCount: number;
  selectedCharacter?: Character;
  baseCharacterCount: number;
  pendingCharacterResourceCount: number;
  onOpenCreateDialog: () => void;
  onOpenSupplementalDialog: () => void;
  onEvolveCharacter: () => void;
  isEvolvingCharacter: boolean;
  selectedCharacterId: string;
}

export default function CharacterPreparationHero(props: CharacterPreparationHeroProps) {
  const {
    characters,
    coreCharacterCount,
    selectedCharacter,
    baseCharacterCount,
    pendingCharacterResourceCount,
    onOpenCreateDialog,
    onOpenSupplementalDialog,
    onEvolveCharacter,
    isEvolvingCharacter,
    selectedCharacterId,
  } = props;
  const recommendedAction = getRecommendedAction({
    characterCount: characters.length,
    coreCharacterCount,
    selectedCharacter,
    pendingCharacterResourceCount,
  });

  return (
    <StepHero
      eyebrow="Cast of characters"
      title="role preparation"
      description="Maintain characters as sustainable narrative assets: complete the cast first, then switch to archives, appearances, resources, timelines, and relationships."
      className="border border-border/60 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted))_100%)] shadow-sm"
    >
      <StatusRail
        items={[
          {
            label: "Created role",
            value: characters.length,
            description: characters.length > 0 ? "The lineup is starting to take shape." : "First create the protagonist or import a basic character.",
            tone: characters.length > 0 ? "success" : "warning",
          },
          {
            label: "core role",
            value: coreCharacterCount,
            description: coreCharacterCount > 0 ? "Continue to complement rivals, allies, and stressors." : "At least make the protagonist and main antagonist clear.",
            tone: coreCharacterCount > 0 ? "success" : "warning",
          },
          {
            label: "current focus",
            value: selectedCharacter?.name ?? "No role selected yet",
            description: selectedCharacter?.role || `${baseCharacterCount} base characters can be imported.`,
            tone: selectedCharacter ? "info" : "neutral",
          },
        ]}
      />
      <StepActionBar
        className="mt-4 border border-border/60 bg-background/80"
        label="Suggestions for next steps"
        description={recommendedAction}
        actions={(
          <>
            <Button onClick={onOpenCreateDialog}>Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</Button>
            <AiButton variant="outline" onClick={onOpenSupplementalDialog}>
              supplementary roles
                                </AiButton>
            <AiButton
              variant="secondary"
              onClick={onEvolveCharacter}
              disabled={isEvolvingCharacter || !selectedCharacterId}
            >
              {isEvolvingCharacter ? "Evolving..." : "Current state of AI evolution"}
            </AiButton>
          </>
        )}
      />
    </StepHero>
  );
}

function getRecommendedAction(input: {
  characterCount: number;
  coreCharacterCount: number;
  selectedCharacter?: Character;
  pendingCharacterResourceCount: number;
}): string {
  if (input.characterCount === 0) {
    return "First create a protagonist or import a basic character so that there is a clear action subject for subsequent world, volume planning and chapter generation.";
  }
  if (input.coreCharacterCount === 0) {
    return "Mark your protagonist, main antagonist, or key ally clearly to avoid the lack of a stable source of stress in subsequent chapters.";
  }
  if (input.pendingCharacterResourceCount > 0) {
    return `有 ${input.pendingCharacterResourceCount} 条资源变更等待确认，建议到“资源”页核对。`;
  }
  if (!input.selectedCharacter) {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  return "Prioritize checking current targets, recent appearances, and key resources before deciding whether to let the AI ​​evolve the state.";
}
